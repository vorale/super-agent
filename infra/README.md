# Super Agent Infra — 部署指南

## 概述

本项目提供两种部署方式：

- **一键部署**（推荐）：`deploy-full.sh` 自动完成 CDK 基础设施 + 代码部署 + AgentCore 容器，约 20-30 分钟
- **分步部署**：手动执行 CDK、`deploy.sh`、AgentCore 各阶段

### 架构

```
用户 → CloudFront → S3 (前端静态文件)
                  → EC2 Nginx (API /api/*, WebSocket /ws/*)
                       → Node.js 后端 (port 3000)
                       → RDS PostgreSQL
                       → ElastiCache Redis
                       → Bedrock AgentCore Runtime (容器化 Agent)
```

## 前置条件

| 工具 | 用途 |
|------|------|
| AWS CLI v2 | 基础设施操作 |
| SSM Session Manager 插件 | SSH 隧道（不需要公网 SSH） |
| Node.js 22+ | 前后端构建 |
| Docker (buildx, ARM64) | AgentCore 容器构建，Apple Silicon 原生支持 |
| EC2 Key Pair | 在目标 region 创建，本地有 `.pem` 私钥 |

确认 AWS 身份：

```bash
aws sts get-caller-identity
aws ec2 describe-key-pairs --query "KeyPairs[].KeyName" --region us-west-2
```

## 一键部署（推荐）

### 带自定义域名（CloudFront CDN）

需要 Route53 托管的域名。查找 hosted zone ID：

```bash
aws route53 list-hosted-zones --query "HostedZones[].{Name:Name,Id:Id}" --output table
```

执行部署：

```bash
cd /path/to/super-agent

./infra/scripts/deploy-full.sh ~/Downloads/my-key.pem \
  --stack SuperAgentProd \
  --region us-west-2 \
  --domain app.example.com \
  --hosted-zone-id Z01234567890ABC
```

### 可选参数

```bash
--stack <name>          # Stack 名称（默认 SuperAgent），不同 stack 完全隔离
--region <region>       # AWS Region（默认 us-west-2）
--bedrock-ak <key>      # 跨账号 Bedrock 凭证（可选）
--bedrock-sk <secret>   # 跨账号 Bedrock 凭证（可选）
--skip-cdk              # 跳过基础设施（已有 stack 时用）
--skip-agentcore        # 跳过 AgentCore 容器部署
--skip-frontend         # 跳过前端构建
--skip-backend          # 跳过后端构建
```

### 部署流程（3 个阶段）

**Phase 1: CDK Deploy**
- 创建 VPC Security Groups、EC2 (t4g.small ARM64)、EIP
- RDS PostgreSQL 16.6、ElastiCache Redis 7.1
- S3 桶（Avatar、Skills、Workspace、Frontend）
- CloudFront + ACM 证书 + Route53 ALIAS
- IAM Role（EC2 + AgentCore）
- 等待 EC2 UserData 完成（安装 Node.js、Nginx、PostgreSQL client 等）

**Phase 2: Code Deploy**（调用 `deploy.sh`）
- 从 SecretsManager 获取 RDS 凭证，生成 `.env`
- 构建前端（Vite）→ rsync 到 EC2 + S3 sync + CloudFront 失效
- 编译后端（tsc）→ rsync 到 EC2 → npm ci → prisma migrate → seed → 重启
- 首次部署自动创建 admin 用户：`admin@example.com` / `Admin1234!`

**Phase 3: AgentCore Setup**
- 创建 ECR 仓库，构建推送 ARM64 Docker 镜像
- 创建 IAM Execution Role（Bedrock、S3、ECR、Browser、Code Interpreter 权限）
- 创建 Bedrock AgentCore Runtime
- 更新 EC2 `.env` 启用 AgentCore 模式

### 部署完成后

访问 `https://app.example.com`，使用 `admin@example.com` / `Admin1234!` 登录。

> **重要**：首次登录后请立即修改 admin 密码。

## 增量部署

全量部署完成后，日常代码更新不需要重建基础设施：

```bash
# 只部署代码（跳过 CDK 和 AgentCore）
./infra/scripts/deploy-full.sh ~/Downloads/my-key.pem \
  --stack SuperAgentProd --skip-cdk --skip-agentcore

# 或直接用 deploy.sh
./infra/scripts/deploy.sh ~/Downloads/my-key.pem --stack SuperAgentProd

# 只更新前端
./infra/scripts/deploy.sh ~/Downloads/my-key.pem --stack SuperAgentProd --skip-backend

# 只更新后端
./infra/scripts/deploy.sh ~/Downloads/my-key.pem --stack SuperAgentProd --skip-frontend
```

## 多环境隔离

每个 `--stack` 名称创建完全独立的资源（EC2、RDS、Redis、S3、CloudFront）：

```bash
# 生产环境
./infra/scripts/deploy-full.sh ~/key.pem --stack SuperAgentProd --domain app.example.com --hosted-zone-id Z0XXX

# 测试环境
./infra/scripts/deploy-full.sh ~/key.pem --stack SuperAgentTest --domain test.example.com --hosted-zone-id Z0XXX
```

S3 桶名、SecretsManager secret 名、ElastiCache 集群名都以 stack 名为前缀，不会冲突。

## CI/CD（GitHub Actions）

项目包含 `.github/workflows/deploy-test.yml`，push 到 main 自动部署测试环境。

### 配置 GitHub Secrets

```bash
./infra/scripts/setup-github-secrets.sh ~/Downloads/my-key.pem --repo owner/repo
```

自动配置：`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`EC2_KEY_PAIR_NAME`、`EC2_SSH_PRIVATE_KEY`。

另需手动添加（如使用 CDN）：`TEST_DOMAIN_NAME`、`TEST_HOSTED_ZONE_ID`。

### Pipeline 流程

1. **Build & Test** — 编译前后端 + 运行测试
2. **CDK Deploy** — 部署/更新测试 Stack（`SuperAgentTest`）
3. **Deploy Application** — 通过 SSM 部署代码到 EC2
4. **Smoke Test** — 健康检查 + 前端可达性验证

## LiteLLM 模型网关（可选）

部署完成后，如需接入第三方模型（Kimi K2.5、GLM 5.1 等），SSH 到 EC2 执行：

```bash
sudo bash /path/to/infra/scripts/setup-litellm.sh
```

然后编辑 `/opt/litellm/.env` 填入 API Key，重启 `sudo systemctl restart litellm`。

访问 `https://your-domain/modelservice/ui/` 管理模型。

## 运维

### 查看日志

```bash
# 通过 SSM 连接
aws ssm start-session --target <InstanceId> --region us-west-2

# 后端日志
tail -f /opt/super-agent/logs/backend.log
tail -f /opt/super-agent/logs/backend-error.log

# Nginx 日志
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

日志也会自动推送到 CloudWatch Logs（`/super-agent/backend`、`/super-agent/nginx-*`）。

### 重启服务

```bash
sudo systemctl restart backend
sudo systemctl status backend
```

### 环境变量

生产环境变量在 `/opt/super-agent/.env`（systemd EnvironmentFile）。
`deploy.sh` 的合并策略是"已有值不覆盖"，手动添加的变量不会被后续部署覆盖。

### AgentCore ↔ Claude 模式切换

```bash
# 切换到 Claude 模式（EC2 子进程）
sed -i 's/^AGENT_RUNTIME=agentcore/AGENT_RUNTIME=claude/' /opt/super-agent/.env
sudo systemctl restart backend

# 切回 AgentCore 模式
sed -i 's/^AGENT_RUNTIME=claude/AGENT_RUNTIME=agentcore/' /opt/super-agent/.env
sudo systemctl restart backend
```

### 更新 AgentCore 容器

```bash
cd agentcore
docker buildx build --platform linux/arm64 \
  -t <ACCOUNT_ID>.dkr.ecr.us-west-2.amazonaws.com/super-agent-agentcore:latest \
  --load .
docker push <ACCOUNT_ID>.dkr.ecr.us-west-2.amazonaws.com/super-agent-agentcore:latest

# 通知 AgentCore 拉取新镜像（⚠️ --environment-variables 是全量替换，必须传完整）
aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id <runtime-id> \
  --agent-runtime-artifact '{"containerConfiguration":{"containerUri":"<ECR_URI>:latest"}}' \
  --role-arn "arn:aws:iam::<ACCOUNT_ID>:role/super-agent-agentcore-execution-role" \
  --network-configuration '{"networkMode":"PUBLIC"}' \
  --environment-variables '{"CLAUDE_CODE_USE_BEDROCK":"1","ANTHROPIC_MODEL":"us.anthropic.claude-opus-4-6-v1","AWS_REGION":"us-west-2","WORKSPACE_S3_REGION":"us-west-2"}' \
  --region us-west-2
```

## 销毁环境

```bash
cd infra
npx cdk destroy -c stackName=SuperAgentProd --region us-west-2 --force
```

CDK destroy 后需要手动清理：

```bash
# Avatar 和 Skills 桶（removalPolicy=RETAIN，CDK 不删）
aws s3 rb s3://<avatar-bucket-name> --force
aws s3 rb s3://<skills-bucket-name> --force

# AgentCore 资源（不在 CDK 管理范围）
aws bedrock-agentcore-control delete-agent-runtime --agent-runtime-id <id> --region us-west-2
aws ecr delete-repository --repository-name super-agent-agentcore --force --region us-west-2
aws iam delete-role-policy --role-name super-agent-agentcore-role-<StackName> --policy-name agentcore-permissions-<StackName>
aws iam delete-role --role-name super-agent-agentcore-role-<StackName>
```

## 已知注意事项

- **EC2 UserData 耗时**：首次创建 EC2 约需 3-5 分钟完成 bootstrap，`deploy-full.sh` 会自动等待
- **CloudFront Origin 占位符**：CDK 创建时 EC2 IP 未知，使用占位符域名；`deploy-full.sh` 会在 Phase 1 后自动替换为实际 EC2 公网 DNS
- **`DnsValidatedCertificate` 废弃警告**：CDK 会输出 deprecation warning，功能正常，未来版本需迁移到 `acm.Certificate`
- **npm ci fallback**：如果 `package-lock.json` 与 `package.json` 不同步，部署脚本会自动 fallback 到 `npm install`
- **S3 桶 RETAIN 策略**：Avatar 和 Skills 桶设为 RETAIN，CDK destroy 不会删除，需手动清理
