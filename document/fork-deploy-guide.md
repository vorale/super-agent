# Super Agent — Fork 后 CI/CD 部署教程

本教程面向 Fork 了 [Super Agent](https://github.com/vorale/super-agent) 项目的用户，指导你从零开始配置 GitHub Actions CI/CD Pipeline，将项目部署到你自己的 AWS 账号中。

---

## 目录

- [架构概览](#架构概览)
- [前置条件](#前置条件)
- [第一步：Fork 仓库](#第一步fork-仓库)
- [第二步：准备 AWS 资源](#第二步准备-aws-资源)
- [第三步：配置 GitHub Secrets](#第三步配置-github-secrets)
- [第四步：启动 CI/CD Pipeline](#第四步启动-cicd-pipeline)
- [第五步：验证部署](#第五步验证部署)
- [可选配置](#可选配置)
- [常见问题](#常见问题)

---

## 架构概览

CI/CD Pipeline 由 GitHub Actions 驱动，包含 4 个阶段：

```
┌─────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌────────────┐
│ Build & Test │ →  │ CDK Deploy       │ →  │ Deploy App       │ →  │ Smoke Test │
│             │    │ (基础设施)         │    │ (前端+后端)       │    │            │
└─────────────┘    └──────────────────┘    └──────────────────┘    └────────────┘
```

部署到 AWS 上的资源包括：

| 资源 | 说明 |
|------|------|
| EC2 (t4g.small) | 运行后端服务 + Nginx 反向代理 |
| RDS PostgreSQL | 数据库 |
| ElastiCache Redis | 消息队列 (BullMQ) |
| S3 Buckets × 3 | 头像、Skills、工作区存储 |
| CloudFront + Route53 | （可选）CDN + 自定义域名 |
| Cognito | （可选）SSO 认证 |

触发方式：
- **自动触发**：push 到 `main` 分支（忽略 `.md`、`document/`、`images/` 等文件变更）
- **手动触发**：在 GitHub Actions 页面点击 "Run workflow"，可选择跳过基础设施 / 前端 / 后端阶段

---

## 前置条件

在开始之前，请确保你具备以下条件：

1. **GitHub 账号** — 用于 Fork 仓库和运行 GitHub Actions
2. **AWS 账号** — 用于部署所有云资源
3. **AWS CLI v2** — 本地已安装并配置好凭证（`aws configure`）
4. **GitHub CLI (`gh`)** — 用于快速配置 Secrets（可选，也可以在网页上手动配置）
5. **EC2 Key Pair** — 在 AWS 目标 Region（默认 `us-west-2`）中创建好

---

## 第一步：Fork 仓库

1. 打开 [https://github.com/vorale/super-agent](https://github.com/vorale/super-agent)
2. 点击右上角 **Fork** 按钮
3. 选择你的 GitHub 账号作为目标
4. 等待 Fork 完成

> **注意**：Fork 时请确保勾选了 "Copy the `main` branch only"，这样可以避免拉取不必要的分支。

---

## 第二步：准备 AWS 资源

### 2.1 创建 IAM 用户

Pipeline 需要一个拥有足够权限的 IAM 用户。建议创建一个专用的 CI/CD 用户：

1. 登录 [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. 创建一个新用户（例如 `super-agent-cicd`）
3. 附加以下权限策略（或使用自定义策略限制范围）：
   - `AmazonEC2FullAccess`
   - `AmazonRDSFullAccess`
   - `AmazonElastiCacheFullAccess`
   - `AmazonS3FullAccess`
   - `AmazonSSMFullAccess`
   - `AWSCloudFormationFullAccess`
   - `IAMFullAccess`（CDK 需要创建 IAM Role）
   - `SecretsManagerReadWrite`
   - `AmazonVPCFullAccess`
   - 如果启用 CDN：`CloudFrontFullAccess`、`AmazonRoute53FullAccess`、`AWSCertificateManagerFullAccess`
   - 如果启用 Cognito：`AmazonCognitoPowerUser`
4. 创建 **Access Key**（选择 "Command Line Interface (CLI)" 用途）
5. 记录 `Access Key ID` 和 `Secret Access Key`

> **安全提示**：生产环境建议使用 OIDC（OpenID Connect）代替长期凭证。本教程为简化流程使用 Access Key。

### 2.2 创建 EC2 Key Pair

1. 登录 [EC2 Console](https://console.aws.amazon.com/ec2/)
2. 确保 Region 选择为 **us-west-2**（Oregon）
3. 左侧菜单 → Network & Security → **Key Pairs**
4. 点击 **Create key pair**：
   - 名称：例如 `super-agent-key`
   - 类型：RSA
   - 格式：`.pem`
5. 下载并妥善保存私钥文件 `super-agent-key.pem`

> 这个私钥文件后续需要配置到 GitHub Secrets 中，Pipeline 通过 SSM 隧道 + SSH 部署代码到 EC2。

---

## 第三步：配置 GitHub Secrets

Pipeline 需要以下 GitHub Secrets：

### 必需的 Secrets

| Secret 名称 | 说明 | 示例值 |
|-------------|------|--------|
| `AWS_ACCESS_KEY_ID` | IAM 用户的 Access Key ID | `<your-access-key-id>` |
| `AWS_SECRET_ACCESS_KEY` | IAM 用户的 Secret Access Key | `<your-secret-access-key>` |
| `EC2_KEY_PAIR_NAME` | EC2 Key Pair 的名称（不含 `.pem`） | `super-agent-key` |
| `EC2_SSH_PRIVATE_KEY` | EC2 Key Pair 的私钥文件完整内容 | `.pem` 文件的完整内容 |

### 可选的 Secrets（启用 CDN 时需要）

| Secret 名称 | 说明 | 示例值 |
|-------------|------|--------|
| `TEST_DOMAIN_NAME` | 自定义域名 | `app.example.com` |
| `TEST_HOSTED_ZONE_ID` | Route53 Hosted Zone ID | `Z0123456789ABCDEF` |

### 方式一：使用脚本自动配置（推荐）

项目提供了一个辅助脚本，可以一键将本地 AWS 凭证和 SSH 私钥配置到 GitHub Secrets：

```bash
# 克隆你 Fork 的仓库
git clone https://github.com/<你的用户名>/super-agent.git
cd super-agent

# 运行配置脚本
# 参数1：SSH 私钥文件路径
# --repo：你的 GitHub 仓库（owner/repo 格式）
./infra/scripts/setup-github-secrets.sh ~/Downloads/super-agent-key.pem \
  --repo <你的用户名>/super-agent

# 如果 AWS 凭证不在 default profile，指定 profile：
./infra/scripts/setup-github-secrets.sh ~/Downloads/super-agent-key.pem \
  --profile my-aws-profile \
  --repo <你的用户名>/super-agent
```

脚本会自动设置以下 4 个 Secrets：
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `EC2_KEY_PAIR_NAME`（从文件名推断，例如 `super-agent-key.pem` → `super-agent-key`）
- `EC2_SSH_PRIVATE_KEY`

> **前提**：需要先安装 [GitHub CLI](https://cli.github.com/) 并执行 `gh auth login` 登录。

如果需要配置 CDN 相关的可选 Secrets，手动补充：

```bash
gh secret set TEST_DOMAIN_NAME --repo <你的用户名>/super-agent --body "app.example.com"
gh secret set TEST_HOSTED_ZONE_ID --repo <你的用户名>/super-agent --body "Z0123456789ABCDEF"
```

### 方式二：在 GitHub 网页上手动配置

1. 打开你 Fork 的仓库页面
2. 进入 **Settings** → **Secrets and variables** → **Actions**
3. 点击 **New repository secret**，逐个添加：

**添加 `AWS_ACCESS_KEY_ID`：**
- Name: `AWS_ACCESS_KEY_ID`
- Secret: 粘贴你的 Access Key ID

**添加 `AWS_SECRET_ACCESS_KEY`：**
- Name: `AWS_SECRET_ACCESS_KEY`
- Secret: 粘贴你的 Secret Access Key

**添加 `EC2_KEY_PAIR_NAME`：**
- Name: `EC2_KEY_PAIR_NAME`
- Secret: 输入 Key Pair 名称（例如 `super-agent-key`，不含 `.pem`）

**添加 `EC2_SSH_PRIVATE_KEY`：**
- Name: `EC2_SSH_PRIVATE_KEY`
- Secret: 打开 `.pem` 文件，复制全部内容粘贴进去（包括首尾的标记行）

配置完成后，Secrets 页面应该如下所示：

```
Repository secrets
├── AWS_ACCESS_KEY_ID          Updated just now
├── AWS_SECRET_ACCESS_KEY      Updated just now
├── EC2_KEY_PAIR_NAME          Updated just now
└── EC2_SSH_PRIVATE_KEY        Updated just now
```

---

## 第四步：启动 CI/CD Pipeline

### 方式一：推送代码自动触发

向 `main` 分支推送任何代码变更（非 `.md` 文件）即可自动触发 Pipeline：

```bash
# 做一个小改动，例如在 README 末尾加一行注释
# 注意：.md 文件变更不会触发 Pipeline，需要改其他文件
echo "// trigger deploy" >> backend/src/index.ts
git add .
git commit -m "trigger initial deployment"
git push origin main
```

### 方式二：手动触发（推荐首次部署使用）

1. 打开你 Fork 的仓库页面
2. 进入 **Actions** 标签页
3. 左侧选择 **Deploy Test Environment** workflow
4. 点击 **Run workflow** 按钮
5. 选择 `main` 分支
6. 首次部署保持所有选项为默认（不跳过任何阶段）
7. 点击绿色的 **Run workflow** 按钮

> **首次部署耗时约 15-25 分钟**，其中 CDK 创建基础设施约 10-15 分钟，EC2 初始化约 3-5 分钟，应用部署约 5 分钟。后续部署如果跳过基础设施阶段，通常 5-8 分钟即可完成。

### 手动触发的可选参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| Skip CDK infrastructure deploy | 跳过基础设施部署（复用已有 Stack） | `false` |
| Skip frontend build & deploy | 跳过前端构建和部署 | `false` |
| Skip backend build & deploy | 跳过后端构建和部署 | `false` |

> **提示**：首次部署后，如果只修改了后端代码，可以勾选 "Skip CDK" + "Skip frontend" 来加速部署。

---

## 第五步：验证部署

### 5.1 查看 Pipeline 运行状态

在 **Actions** 标签页可以看到 Pipeline 的实时运行状态。4 个 Job 依次执行：

1. ✅ **Build & Test** — 编译前后端代码，运行测试
2. ✅ **CDK Deploy** — 创建/更新 AWS 基础设施
3. ✅ **Deploy Application** — 部署前后端到 EC2
4. ✅ **Smoke Test** — 健康检查

### 5.2 获取访问地址

Pipeline 完成后，在 **Smoke Test** Job 的 "Summary" 步骤中可以看到：

```
=============================================
  🧪 Test Environment Deployed
=============================================
  URL:     https://<你的域名或IP>
  Health:  https://<你的域名或IP>/api/health
  EC2 IP:  <EC2 公网 IP>
  Stack:   SuperAgentTest
  Region:  us-west-2
=============================================
```

### 5.3 访问应用

1. 浏览器打开输出的 URL
2. 如果使用自签名证书（未配置自定义域名），浏览器会提示不安全，点击"继续访问"即可
3. 默认管理员账号（首次部署自动创建）：
   - 用户名：`admin@example.com`
   - 密码：`Admin1234!`

> **重要**：首次登录后请立即修改默认密码。

---

## 可选配置

### 启用 CloudFront CDN + 自定义域名

如果你有自己的域名并且已在 Route53 中创建了 Hosted Zone：

1. 在 GitHub Secrets 中添加：
   - `TEST_DOMAIN_NAME`：例如 `app.example.com`
   - `TEST_HOSTED_ZONE_ID`：Route53 Hosted Zone ID
2. Pipeline 会自动创建 CloudFront 分配、ACM 证书和 DNS 记录
3. 证书验证可能需要几分钟，首次部署时 CDK 会等待验证完成

### 修改部署 Region

默认部署到 `us-west-2`。如需修改：

1. 编辑 `.github/workflows/deploy-test.yml`
2. 修改顶部的环境变量：
   ```yaml
   env:
     AWS_REGION: ap-northeast-1  # 改为你想要的 Region
   ```
3. 确保你的 EC2 Key Pair 也在对应 Region 中创建

### 修改 Stack 名称

默认 Stack 名称为 `SuperAgentTest`。如需修改：

```yaml
env:
  STACK_NAME: MyCustomStackName
```

### 部署后手动添加环境变量

某些环境变量（如第三方 API Key）不由 Pipeline 自动生成，需要部署后手动添加到 EC2 上的 `/opt/super-agent/.env` 文件中。Pipeline 的 merge-env 机制会在后续部署时**保留**你手动添加的变量，不会覆盖。

通过 SSM 连接到 EC2 添加变量：

```bash
# 通过 AWS SSM 连接到 EC2
aws ssm start-session --target <InstanceId> --region us-west-2

# 编辑 .env 文件
sudo vi /opt/super-agent/.env

# 添加完成后重启后端服务
sudo systemctl restart backend
```

常见的手动添加变量：

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_API_KEY` | 如果不使用 Bedrock，直接使用 Anthropic API |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | 邮件发送配置 |
| `LANGFUSE_*` | Langfuse 可观测性配置 |

---

## 常见问题

### Q: Pipeline 在 "CDK bootstrap" 步骤失败？

**A**: 这通常是 IAM 权限不足。确保 IAM 用户拥有 `AWSCloudFormationFullAccess` 和 `IAMFullAccess` 权限。CDK bootstrap 需要在目标 Region 创建一个 S3 Bucket 和 IAM Role。

### Q: Pipeline 在 "Wait for EC2 SSM agent" 步骤超时？

**A**: EC2 实例启动后需要 3-5 分钟安装 SSM Agent。如果超过 10 分钟仍未上线：
1. 检查 EC2 实例是否在运行（AWS Console → EC2）
2. 检查实例的 IAM Role 是否包含 `AmazonSSMManagedInstanceCore` 策略
3. 检查 VPC 是否有 Internet 访问（SSM Agent 需要连接 AWS 端点）

### Q: Pipeline 在 "SSM tunnel" 步骤失败？

**A**: SSM 隧道建立失败时，Pipeline 会自动降级为 SSM SendCommand 模式（不需要 SSH 隧道）。如果仍然失败，检查：
1. `EC2_SSH_PRIVATE_KEY` Secret 是否包含完整的 PEM 文件内容
2. `EC2_KEY_PAIR_NAME` 是否与 AWS 中的 Key Pair 名称一致

### Q: 部署成功但无法访问应用？

**A**: 检查以下几点：
1. EC2 安全组是否允许 80/443 端口入站
2. Nginx 是否正常运行：通过 SSM 连接后执行 `sudo systemctl status nginx`
3. 后端服务是否正常运行：`sudo systemctl status backend`
4. 查看后端日志：`tail -100 /opt/super-agent/logs/backend.log`

### Q: 如何销毁所有资源避免产生费用？

**A**: 在本地执行：

```bash
cd infra
npm ci
npx cdk destroy -c stackName=SuperAgentTest --region us-west-2
```

或者在 AWS Console 中手动删除 CloudFormation Stack `SuperAgentTest`。

> **注意**：RDS 快照和 S3 Bucket 中的数据可能需要手动清理。

### Q: 后续代码更新如何部署？

**A**: 两种方式：
1. **自动**：直接 push 到 `main` 分支，Pipeline 自动触发
2. **手动**：在 Actions 页面手动触发，可以勾选 "Skip CDK" 跳过基础设施阶段以加速部署

---

## Pipeline 环境变量参考

以下是 Pipeline 自动生成并写入 EC2 `/opt/super-agent/.env` 的变量清单：

| 变量 | 来源 | 说明 |
|------|------|------|
| `PORT` | 固定值 `3000` | 后端监听端口 |
| `HOST` | 固定值 `0.0.0.0` | 后端监听地址 |
| `NODE_ENV` | 固定值 `production` | 运行环境 |
| `LOG_LEVEL` | 固定值 `info` | 日志级别 |
| `DATABASE_URL` | Secrets Manager → RDS | PostgreSQL 连接字符串 |
| `REDIS_HOST` | CDK Output | ElastiCache Redis 端点 |
| `REDIS_PORT` | CDK Output | Redis 端口 |
| `AWS_REGION` | Workflow 配置 | AWS Region |
| `S3_BUCKET_NAME` | CDK Output | 头像存储桶 |
| `SKILLS_S3_BUCKET` | CDK Output | Skills 存储桶 |
| `AGENTCORE_WORKSPACE_S3_BUCKET` | CDK Output | 工作区存储桶 |
| `CORS_ORIGIN` | 推导自域名或 IP | 前端 URL |
| `APP_URL` | 推导自域名或 IP | 应用 URL |
| `CLAUDE_CODE_USE_BEDROCK` | 固定值 `1` | 使用 Bedrock |
| `CLAUDE_MODEL` | 固定值 | Claude 模型 ID |
| `BEDROCK_API_KEY` | GitHub Secret（可选） | Bedrock API Key（Bearer Token）。设置后优先于 AK/SK；SDK 和 Claude CLI 均自动识别。未设置则回退到实例角色 / AK/SK。 |
| `AUTH_MODE` | 固定值 `local` | 认证模式 |
| `JWT_SECRET` | 自动生成（随机） | JWT 签名密钥 |
