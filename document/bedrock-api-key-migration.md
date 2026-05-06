# Bedrock API Key 支持 —— 改动记录

**变更类型**：功能增强（backward-compatible，无破坏性改动）
**影响范围**：backend 所有调用 AWS Bedrock 的路径 + infra 部署脚本
**核心目标**：让所有通过 Bedrock 访问模型的地方都支持使用 **Bedrock API Key（Bearer Token）** 进行鉴权，作为 AK/SK 的推荐替代方案。

---

## 1. 背景

此次改动前，backend 通过两种方式访问 Bedrock：

1. **SDK 直调**（7 处）：`ai.service`, `avatarService`, `bedrock-embedder`, `briefing-generator.service`, `distillation.service`, `rehearsal.service`, `llm-proxy.service`, `showcase.routes` —— 每处都各自 `new BedrockRuntimeClient(...)`，credential 逻辑散落且写法不一致。
2. **Claude Code CLI 子进程**（1 处）：`claude-agent.service` —— 通过环境变量把 AK/SK 注入到 Claude SDK spawn 出来的子进程。

两条路径都只支持 SigV4 (AK/SK)。AWS 近期为 Bedrock 提供了 **API Key（Bearer Token）** 鉴权方式，AWS SDK v3 会自动识别 `AWS_BEARER_TOKEN_BEDROCK` 环境变量并切换到 bearer 认证 —— 单 token、易轮换、不需要 IAM `bedrock:InvokeModel` 策略。本次改动将其统一接入。

---

## 2. 鉴权优先级（所有 Bedrock 调用一致）

```
1. BEDROCK_API_KEY  /  AWS_BEARER_TOKEN_BEDROCK   ← 推荐
2. BEDROCK_AWS_ACCESS_KEY_ID + BEDROCK_AWS_SECRET_ACCESS_KEY   （跨账号 Bedrock 专用 AK/SK）
3. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY     （共享 AK/SK）
4. Default provider chain                         （EC2 实例角色 / ECS 任务角色 / ~/.aws/credentials）
```

`AWS_REGION` 始终必需。

> ⚠️ **关键点**：当 API Key 存在时，代码会显式 **剥离** AK/SK —— 否则 AWS SDK 会优先 SigV4 而非 Bearer Token，造成鉴权混乱。

---

## 3. 改动文件清单

| 分类 | 文件 | 说明 |
| --- | --- | --- |
| **新增** | `backend/src/services/bedrock-client.ts` | 共享的 Bedrock client 工厂，集中所有 credential 选择逻辑 |
| **配置** | `backend/src/config/index.ts` | 新增 `BEDROCK_API_KEY` / `AWS_BEARER_TOKEN_BEDROCK` env schema 和 `config.bedrock` 访问器 |
| **配置** | `backend/.env.example` | 新增 `BEDROCK_API_KEY` 配置项和优先级说明 |
| **配置** | `backend/docker-compose.yml` | 向 backend 容器透传 `BEDROCK_API_KEY` |
| **SDK 调用点** | `backend/src/services/ai.service.ts` | Nova Lite 调用改用 `createBedrockClient()` |
| **SDK 调用点** | `backend/src/services/avatarService.ts` | Nova Canvas（固定 us-east-1）改用 `createBedrockClient()` |
| **SDK 调用点** | `backend/src/services/bedrock-embedder.ts` | Nova Multimodal Embeddings 改用 `createBedrockClient()` |
| **SDK 调用点** | `backend/src/services/briefing-generator.service.ts` | Claude Haiku 改用 `createBedrockClient()` |
| **SDK 调用点** | `backend/src/services/distillation.service.ts` | 蒸馏服务改用 `createBedrockClient()` |
| **SDK 调用点** | `backend/src/services/rehearsal.service.ts` | 推演服务改用 `createBedrockClient()` |
| **SDK 调用点** | `backend/src/services/llm-proxy/llm-proxy.service.ts` | OpenAI 兼容代理改用 `createBedrockClient()` |
| **SDK 调用点** | `backend/src/routes/showcase.routes.ts` | Showcase 路由改用 `createBedrockClient()` |
| **子进程调用** | `backend/src/services/claude-agent.service.ts` | Claude Code CLI 子进程 env 改用 `buildBedrockSubprocessEnv()`，并剥离冲突的 AK/SK |
| **验证逻辑** | `backend/src/utils/claude-config.ts` | `validateClaudeCredentials` 新增 `bedrockApiKey` 字段，支持 API Key + Region 的合法凭证组合 |
| **测试** | `backend/tests/unit/claude-config.test.ts` | 新增 6 个 API Key 路径的单元测试 |
| **测试** | `backend/tests/unit/claude-config.pbt.test.ts` | 新增 4 个 API Key 路径的属性测试 |
| **文档** | `backend/AWS_SETUP.md` | 重写鉴权章节，介绍 API Key 优先、IAM 策略、故障排查 |
| **基础设施** | `infra/scripts/deploy.sh` | 新增 `--bedrock-api-key` 参数，写入生成的 `.env` |
| **基础设施** | `infra/scripts/deploy-full.sh` | 新增 `--bedrock-api-key` 参数，注入到 AgentCore Runtime 环境变量 |
| **基础设施** | `infra/scripts/ci/gen-base-env.py` | 新增 `--bedrock-api-key` CLI 参数 |
| **基础设施** | `infra/README.md` | 更新 deploy 参数说明 + AgentCore 手动更新示例 |
| **基础设施** | `document/fork-deploy-guide.md` | 环境变量表新增 `BEDROCK_API_KEY` 行 |

合计：**1 个新文件 + 20 个修改文件**。

---

## 4. 核心改动详解

### 4.1 新增共享工厂 `services/bedrock-client.ts`

导出三个函数：

- `createBedrockClient({ region?, maxAttempts? })` —— 按优先级选择鉴权方式，返回 `BedrockRuntimeClient`。
- `buildBedrockSubprocessEnv()` —— 为 spawn 出来的子进程（Claude Code CLI）构造环境变量对象，遵循相同优先级；API Key 在场时 **不** 输出 AK/SK。
- `hasBedrockApiKey()` —— 便于调用方判断是否需要清理 process.env 里残留的 AK/SK。

### 4.2 Config 新增 `config.bedrock` 命名空间

```ts
bedrock: {
  apiKey:          env.BEDROCK_API_KEY ?? env.AWS_BEARER_TOKEN_BEDROCK,
  region:          env.AWS_REGION,
  accessKeyId:     env.BEDROCK_AWS_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.BEDROCK_AWS_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY,
}
```

保留 `config.aws.*` 与 `config.claude.bedrockAccessKeyId` 等旧字段用于向后兼容。

### 4.3 SDK 调用点统一重写

**改动前**（典型样例，重复 7 份）：
```ts
const bedrockClient = new BedrockRuntimeClient({
  region: config.aws.region,
  ...(config.aws.accessKeyId && config.aws.secretAccessKey
    ? { credentials: { ... } } : {}),
});
```

**改动后**：
```ts
const bedrockClient = createBedrockClient({ region: config.aws.region });
```

### 4.4 Claude CLI 子进程 env 处理

`claude-agent.service.ts` 中：

```ts
if (config.claude.useBedrock) {
  options.env = {
    ...process.env,
    ...platformEnv,
    CLAUDE_CODE_USE_BEDROCK: '1',
    ...buildBedrockSubprocessEnv(),  // 带入 API Key 或 AK/SK
  };
  if (hasBedrockApiKey()) {
    // 防止 SDK 优先 SigV4 —— 删除残留的 AK/SK
    delete options.env.AWS_ACCESS_KEY_ID;
    delete options.env.AWS_SECRET_ACCESS_KEY;
    delete options.env.AWS_SESSION_TOKEN;
  }
  delete options.env.ANTHROPIC_API_KEY;   // 防止回退到 Anthropic 直调
  delete options.env.ANTHROPIC_AUTH_TOKEN;
  delete options.env.ANTHROPIC_BASE_URL;
}
```

### 4.5 Credential 验证 `validateClaudeCredentials`

Bedrock 路径现在接受 **两种** 合法凭证组合：

- **路径 A**：`bedrockApiKey` + `awsRegion`（新增）
- **路径 B**：`awsAccessKeyId` + `awsSecretAccessKey` + `awsRegion`（原有）

错误提示也更新为同时指引两种配置方式。

### 4.6 Infra 部署脚本

三处改动：

1. **`deploy.sh`** 新增 `--bedrock-api-key <key>` 选项；若提供则追加 `BEDROCK_API_KEY=...` 到生成的 backend `.env`。
2. **`deploy-full.sh`** 新增 `--bedrock-api-key` 选项；构造 AgentCore Runtime `ENV_VARS` JSON 时优先使用 API Key（同时设置 `AWS_BEARER_TOKEN_BEDROCK` 和 `BEDROCK_API_KEY` 两个变量，兼容 SDK 和 CLI 不同识别路径），仅在未提供 API Key 时才回退到 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`。
3. **`gen-base-env.py`** 新增 `--bedrock-api-key` 参数，可选写入 `BEDROCK_API_KEY` 行。

---

## 5. 验证结果

### 5.1 覆盖完整性

- ✅ 扫描 `backend/src` 目录下所有 `new BedrockRuntimeClient(...)`：改动后只剩 `services/bedrock-client.ts` 内部的 3 处实例化（工厂本身），**所有业务代码的直接实例化均已消除**。
- ✅ 扫描所有 `@aws-sdk/client-bedrock-runtime` 导入：7 个业务文件已全部切换到工厂；其他导入 `@aws-sdk/client-bedrock-agentcore-control` 的文件是 AgentCore **控制面** 操作（创建/更新 runtime），不涉及模型推理，无需改动。
- ✅ `agentcore/` Python 代码使用容器环境变量（`CLAUDE_CODE_USE_BEDROCK=1`）由 `deploy-full.sh` 注入 —— 已随脚本改动一并支持 API Key。

### 5.2 单元测试

```
✓ tests/unit/claude-config.test.ts        (24 tests)   ← +6 new
✓ tests/unit/claude-config.pbt.test.ts    (16 tests)   ← +4 new
Test Files  2 passed (2)
Tests       40 passed (40)
```

### 5.3 类型检查

对比 `git stash` 前后 `tsc --noEmit` 输出，本次改动 **未引入任何新的类型错误**。仅存的 type error 均为 stash 前就已存在（`showcase.routes` / `rehearsal.service` / `skill.repository` 等与本次改动无关的文件）。

### 5.4 与本次改动无关的观察（非阻塞）

- `claude-agent-service.test.ts` 中有 3 个与时间戳相关的测试在 baseline（未应用本改动时）同样失败，属于既有 flaky，本次改动未引入。
- `validateClaudeCredentials` 函数目前仅在测试中被调用，runtime 启动路径并未主动调用校验 —— 这是既有行为，本次改动未修复也未恶化。
- `llm-proxy.service.ts` 存在 `MODEL_MAP` unused import 的 warning，为本次改动之前就存在，未清理。
- `avatarService.ts` 中 region 仍从 `process.env.AWS_REGION` 直接读取而非 `config.aws.region`（Bedrock 客户端本身固定 `us-east-1`，功能不受影响），为保持该文件其他逻辑不动未顺带修改。

---

## 6. 部署指引

### 6.1 生成 Bedrock API Key

AWS Console → Bedrock → **API Keys** → Create key。选择对应账号和 region 权限。

### 6.2 本地 / Docker

在 `backend/.env` 中：
```bash
AWS_REGION=us-east-1
BEDROCK_API_KEY=ABSKQmVkcm9ja0FQSUtleS...
# AK/SK 可保留用于 S3/Cognito；Bedrock 调用会自动跳过它们
```

### 6.3 CDK / Fork CI/CD

GitHub Secrets 新增 `BEDROCK_API_KEY`，由 CI 透传给 `deploy.sh` / `deploy-full.sh`：
```bash
./infra/scripts/deploy-full.sh \
  --stack SuperAgent \
  --region us-west-2 \
  --bedrock-api-key "$BEDROCK_API_KEY"
```

### 6.4 已部署的 AgentCore Runtime 手动刷新

参考 `infra/README.md` 第 3.2 节，在 `--environment-variables` JSON 中追加：
```json
"AWS_BEARER_TOKEN_BEDROCK": "ABSK...",
"BEDROCK_API_KEY": "ABSK..."
```
（两个 key 都传，分别匹配 AWS SDK 和 Claude CLI 的识别路径。）

---

## 7. 回滚策略

本改动完全向后兼容 —— 不设置 `BEDROCK_API_KEY` 时，系统自动回退到原有的 AK/SK / 实例角色行为。**无需 DB 迁移、无需破坏性操作**。

若需完全回滚，直接 `git revert` 本次提交即可，无数据面副作用。

---

## 8. 后续修复：强制 `authSchemePreference` 以绕开 SigV4 抢占

### 8.1 现象

首轮改动上线后，CloudWatch `bedrock/aws/bedrock/modelinvocations` 与 CloudTrail 里出现分裂现象：

- ✅ **Opus / Haiku global**（来自 Claude Code CLI 子进程）→ `userIdentity = BedrockAPIKey-xxx` → API Key 生效
- ❌ **Nova Lite / Haiku us.***（来自 backend 进程的 AWS Node SDK 直调）→ `userIdentity = SuperAgentProd-SuperAgentEC2Role/<instance-id>` → 仍然用 EC2 实例角色

把 EC2 role 的 `bedrock:InvokeModel` 权限撤掉做验证，CloudTrail 里这些请求立即变成 `AccessDenied` —— 证明 **backend 的 SDK 从头到尾就没尝试过 bearer auth**。

### 8.2 根因

`@aws-sdk/client-bedrock-runtime@3.969.0` 的 `defaultBedrockRuntimeHttpAuthSchemeProvider` 把 scheme 顺序硬编码为：

```js
options.push(createAwsAuthSigv4HttpAuthOption(...));        // ← sigv4 在前
options.push(createSmithyApiHttpBearerAuthHttpAuthOption(...)); // ← bearer 在后
```

`@smithy/core` 的 `httpAuthSchemeMiddleware` 按顺序试探每个 scheme，**第一个能解析出 identity 的方案直接被选中**，循环里是 `break` 没有 try/catch。

两个关键事实：

1. **Auth scheme 之间只在 identity 解析阶段回退**，不在服务端 403 时回退。一旦 SigV4 拿到凭证、签名、发出请求，SDK 就固定用 SigV4，服务端返回什么不影响 scheme 选择。
2. **IMDS 返回的凭证跟 IAM 权限无关**。EC2 的 metadata service 只是把角色的临时凭证给你，它不验证这些凭证能不能调 Bedrock。所以 SigV4 永远能在 EC2 上"解析成功"。

在 EC2（或 ECS / AgentCore 这类有 metadata service 的环境）上，SigV4 的 credential chain 必然成功，**bearer token 永远得不到机会**，`AWS_BEARER_TOKEN_BEDROCK` 被静默忽略。

Claude Code CLI 子进程能走 bearer 是另一回事 —— CLI 自己有内部逻辑或额外 env 把 bearer 抬到前面，这个行为不能依赖。

### 8.3 修复（三处）

**(1) `backend/src/services/bedrock-client.ts` — `createBedrockClient()` 的 API Key 分支**

```ts
if (config.bedrock.apiKey) {
  if (!process.env.AWS_BEARER_TOKEN_BEDROCK) {
    process.env.AWS_BEARER_TOKEN_BEDROCK = config.bedrock.apiKey;
  }
  return new BedrockRuntimeClient({
    region,
    maxAttempts,
    authSchemePreference: ['httpBearerAuth'],   // ← 强制 bearer 优先
  });
}
```

`@smithy/core` 的 `resolveAuthOptions` 会按 preference 重排 scheme 列表，把 bearer 放到最前面。SDK 先尝试 bearer → 成功拿到 token → 直接签请求。SigV4 / IMDS 再也没机会。

**(2) `backend/src/services/bedrock-client.ts` — `buildBedrockSubprocessEnv()` 的 API Key 分支**

```ts
if (config.bedrock.apiKey) {
  env.AWS_BEARER_TOKEN_BEDROCK = config.bedrock.apiKey;
  env.AWS_AUTH_SCHEME_PREFERENCE = 'httpBearerAuth';   // ← 同理，给子进程也加上
  return env;
}
```

Claude CLI 以及 AgentCore 容器内任何用 AWS Node SDK 的代码都共用同一条规则。

**(3) `infra/scripts/deploy-full.sh` — AgentCore Runtime 环境变量**

```sh
if [ -n "$BEDROCK_API_KEY" ]; then
  ENV_VARS="$ENV_VARS,\"AWS_BEARER_TOKEN_BEDROCK\":\"$BEDROCK_API_KEY\",\"BEDROCK_API_KEY\":\"$BEDROCK_API_KEY\",\"AWS_AUTH_SCHEME_PREFERENCE\":\"httpBearerAuth\""
fi
```

让 AgentCore 容器启动时就带上这个 env，容器内的任何 SDK 调用都被同一条规则约束。对已部署的 runtime 需要额外跑一次 `aws bedrock-agentcore-control update-agent-runtime --environment-variables ...` 把新 env 推上去（注意 `--environment-variables` 是全量替换，必须传完整字典）。

### 8.4 为什么不是在 `.env.example` 或 IAM 文档里加东西

`authSchemePreference` 是 SDK 客户端配置，不是用户需要设置的环境变量。把它放在 `createBedrockClient` 工厂里就一劳永逸 —— 调用方（8 个业务服务）无感知，不需要改任何业务代码。对应地，**用户只需要配 `BEDROCK_API_KEY`，其他都由代码内部处理**。

### 8.5 验证方式

部署后：

1. 重启 backend。
2. 触发一次 Nova Lite 调用（创建 Agent 或跑 rehearsal）。
3. 查 CloudTrail `InvokeModel` 事件：
   ```bash
   aws --region us-east-1 cloudtrail lookup-events \
     --lookup-attributes AttributeKey=EventName,AttributeValue=InvokeModel \
     --max-results 10
   ```
4. **新的 Nova Lite 请求 `Username` 应该是 `BedrockAPIKey-xxx`**，不再是 EC2 instance id；`errorCode` 为空。
5. 之前如果把 EC2 role 的 Bedrock 权限撤掉了，现在可以继续保持撤掉状态 —— 所有 Bedrock 调用都走 API Key，跟 EC2 role 再没关系。

### 8.6 经验教训

AWS SDK v3 的 Bearer token 文档通常只讲"设好 `AWS_BEARER_TOKEN_BEDROCK` 就行"。这只在**没有其他可用凭证来源**时才成立 —— 任何能成功解析的 SigV4 credential（AK/SK env、`~/.aws/credentials`、SSO、**IMDS**）都会抢在 bearer 之前。在 EC2/ECS/AgentCore 这类有 metadata service 的环境里，**必须显式设置 `authSchemePreference`**。

另一个结论：auth scheme 的 fallback 不发生在服务端 403 时。一次请求的 scheme 在 prepare 阶段就定死了，即便最终 AccessDenied，SDK 也不会回头尝试别的 scheme。所以"撤掉 EC2 role 权限让 SDK 自动走 bearer"的思路是错的 —— 只会让请求失败而已。
