# 客服模块需求文档

**模块名称**：Customer Service（客服工作台）
**来源分支**：`customer-service`（基于 `main` 分叉，共 7 个 commit）
**文档目的**：完整描述客服模块的产品需求和技术设计，以便在另一个代码库中重新实现

---

## 一、模块概述

为 Super Agent 平台新增一个完整的客服工作台模块，实现 AI 优先的客户服务能力。核心理念是：

> 客户消息进来 → AI 自动分类意图 → 查找 FAQ → 生成回复 → 发送给客户。AI 无法处理时自动转人工。

模块包含四个子系统：
1. **客服工作台**（SupportWorkspace）— 客服人员的工作界面，管理对话、回复客户
2. **客服设置**（SupportSettings）— 配置客服团队、升级规则、工作时间、快捷回复模板
3. **客服分析**（SupportAnalytics）— 查看客服运营指标和 CSAT 满意度数据
4. **知识自学习**（SupportKnowledge）— AI 自动从已解决对话中提炼 FAQ，检测知识盲区

---

## 二、数据模型

### 2.1 核心表

#### `support_conversations`（客服对话）

跟踪每一次客户服务对话的生命周期。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| organization_id | UUID FK → organizations | 多租户隔离 |
| session_id | UUID FK → chat_sessions, nullable | 关联的 Chat Session（AI 对话） |
| channel_type | VARCHAR(20), default `web_widget` | 渠道类型：`web_widget` / `im` / `email` |
| channel_id | VARCHAR(255), nullable | 渠道标识（如 Slack channel ID） |
| status | VARCHAR(20), default `open` | 状态：`open` / `pending_agent` / `resolved` / `closed` |
| priority | VARCHAR(20), default `medium` | 优先级：`low` / `medium` / `high` / `urgent` |
| assigned_agent_id | UUID, nullable | 分配的人工客服 |
| customer_id | UUID FK → customer_profiles, nullable | 关联客户 |
| ai_confidence | FLOAT, nullable | AI 回复的置信度（0-1） |
| sentiment_score | FLOAT, nullable | 客户情绪分数（-1 到 1） |
| first_response_at | TIMESTAMPTZ, nullable | 首次响应时间 |
| resolved_at | TIMESTAMPTZ, nullable | 解决时间 |
| resolution_notes | TEXT, nullable | 解决备注 |
| tags | JSON, default `[]` | 标签 |
| metadata | JSON, default `{}` | 扩展元数据 |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

索引：`organization_id`、`session_id`、`channel_type`、`status`、`priority`、`assigned_agent_id`、`customer_id`、`created_at DESC`、`(organization_id, status)` 复合、`(organization_id, channel_type)` 复合

#### `customer_profiles`（客户档案）

外部客户的统一画像。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| organization_id | UUID FK → organizations | |
| external_id | VARCHAR(255), nullable | 外部系统客户 ID |
| name | VARCHAR(255) | 客户姓名 |
| email | VARCHAR(255), nullable | |
| phone | VARCHAR(50), nullable | |
| avatar_url | TEXT, nullable | |
| source_channel | VARCHAR(20), nullable | 首次接触渠道 |
| tags | JSON, default `[]` | |
| custom_fields | JSON, default `{}` | 自定义字段 |
| notes | TEXT, nullable | 备注 |
| metadata | JSON, default `{}` | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

唯一约束：`(organization_id, external_id)`
索引：`organization_id`、`email`、`source_channel`、`created_at DESC`

#### `faq_articles`（FAQ 知识库）

FAQ 文章，支持手动创建和 AI 自动提炼（draft 状态）。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| organization_id | UUID FK → organizations | |
| business_scope_id | UUID FK → business_scopes, nullable | 关联业务域 |
| question | TEXT | 问题 |
| answer | TEXT | 答案 |
| category | VARCHAR(100), nullable | 分类：general / billing / technical / account / product / shipping / returns |
| tags | JSON, default `[]` | 标签（AI 提炼的会带 `auto-distilled` 标签） |
| view_count | INT, default 0 | 查看次数（FAQ 查找时自动递增） |
| helpful_count | INT, default 0 | 有帮助计数 |
| not_helpful_count | INT, default 0 | 无帮助计数 |
| status | VARCHAR(20), default `published` | 状态：`published` / `draft` / `archived` |
| sort_order | INT, default 0 | 排序 |
| created_by | UUID, nullable | 创建者 |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

索引：`organization_id`、`business_scope_id`、`category`、`status`、`sort_order`、`view_count DESC`、`(organization_id, status)` 复合

### 2.2 扩展表

#### `agent_groups`（客服技能组）

用于对话路由的客服分组。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| organization_id | UUID FK | |
| business_scope_id | UUID FK, nullable | |
| name | VARCHAR(100) | 组名 |
| description | TEXT, nullable | |
| routing_strategy | VARCHAR(20), default `round_robin` | 路由策略：`round_robin` / `least_busy` / `manual` |
| max_concurrent | INT, default 5 | 最大并发对话数 |
| is_active | BOOLEAN, default true | |

唯一约束：`(organization_id, name)`

子表 `agent_group_members`：
- `agent_group_id` FK、`user_id` UUID、`is_active`、`current_load`、`max_load`
- 唯一约束：`(agent_group_id, user_id)`

#### `escalation_rules`（升级规则）

自动升级触发条件。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| organization_id | UUID FK | |
| business_scope_id | UUID FK, nullable | |
| name | VARCHAR(100) | 规则名称 |
| conditions | JSON, default `{}` | 触发条件（如 `{ "type": "wait_time", "threshold": 300 }`） |
| actions | JSON, default `{}` | 触发动作（如 `{ "type": "assign_group", "groupId": "..." }`） |
| priority | INT, default 0 | 规则优先级（高优先级先匹配） |
| is_active | BOOLEAN, default true | |
| agent_group_id | UUID FK → agent_groups, nullable | 关联的客服组 |

#### `csat_surveys`（满意度调查）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| organization_id | UUID FK | |
| conversation_id | UUID FK → support_conversations | |
| customer_id | UUID, nullable | |
| rating | INT | 评分（1-5） |
| comment | TEXT, nullable | 评价内容 |
| channel_type | VARCHAR(20), nullable | |
| submitted_at | TIMESTAMPTZ | |

#### `support_metrics_daily`（每日指标聚合）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| organization_id | UUID FK | |
| business_scope_id | UUID FK, nullable | |
| date | DATE | |
| total_conversations | INT | 总对话数 |
| resolved_conversations | INT | 已解决数 |
| ai_resolved | INT | AI 解决数 |
| human_resolved | INT | 人工解决数 |
| avg_first_response_sec | FLOAT, nullable | 平均首次响应时间（秒） |
| avg_resolution_sec | FLOAT, nullable | 平均解决时间（秒） |
| avg_csat_rating | FLOAT, nullable | 平均满意度 |
| csat_count | INT | 满意度调查数 |
| escalated_count | INT | 升级数 |
| handoff_count | INT | 转人工数 |

唯一约束：`(organization_id, date, business_scope_id)`

#### `response_templates`（快捷回复模板）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| organization_id | UUID FK | |
| business_scope_id | UUID FK, nullable | |
| name | VARCHAR(100) | 模板名称 |
| content | TEXT | 模板内容 |
| category | VARCHAR(50), nullable | 分类 |
| shortcut | VARCHAR(20), nullable | 快捷键（如 `/greet`） |
| channel_types | JSON, default `[]` | 适用渠道 |
| is_active | BOOLEAN, default true | |

#### `business_hours`（工作时间）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| organization_id | UUID FK | |
| name | VARCHAR(100) | |
| timezone | VARCHAR(50), default `Asia/Shanghai` | |
| monday_start ~ sunday_end | VARCHAR(5), nullable | 每天的起止时间（如 `09:00`、`18:00`） |
| holiday_dates | JSON, default `[]` | 节假日列表 |
| offline_message | TEXT, nullable | 非工作时间自动回复 |
| is_active | BOOLEAN, default true | |

---

## 三、后端 API

### 3.1 客服内部 API（JWT 认证）

路由前缀：`/api/support`

#### 对话管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/conversations` | 列表查询，支持 `status`、`channelType`、`assignedAgentId`、`priority` 筛选，`skip`/`take` 分页 |
| GET | `/conversations/:id` | 获取对话详情，同时返回关联 Chat Session 的消息历史（`messages` 数组） |
| POST | `/conversations/:id/messages` | 客服人员发送回复消息。消息写入关联的 Chat Session。如果对话状态为 `pending_agent`，自动改回 `open` 并分配当前客服 |
| PUT | `/conversations/:id/assign` | 分配客服人员，Body: `{ agentId }` |
| PUT | `/conversations/:id/resolve` | 解决对话，Body: `{ notes? }`，设置 `resolved_at` |
| PUT | `/conversations/:id/close` | 关闭对话 |
| POST | `/conversations/:id/handoff` | 请求转人工，状态改为 `pending_agent` |

#### 客户档案

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/customers/:id` | 获取客户档案 + 最近 20 条对话 |

#### FAQ 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/faq` | 列表查询，支持 `status`、`category`、`businessScopeId` 筛选 |
| POST | `/faq` | 创建 FAQ，Body: `{ question, answer, category?, tags?, businessScopeId? }` |
| PUT | `/faq/:id` | 更新 FAQ |

### 3.2 客服设置 API（JWT 认证）

路由前缀：`/api/support/settings`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/agent-groups` | 列表客服技能组（含成员） |
| POST | `/agent-groups` | 创建技能组 |
| PUT | `/agent-groups/:id` | 更新技能组 |
| DELETE | `/agent-groups/:id` | 删除技能组 |
| POST | `/agent-groups/:id/members` | 添加成员 |
| DELETE | `/agent-groups/:id/members/:userId` | 移除成员 |
| GET | `/escalation-rules` | 列表升级规则 |
| POST | `/escalation-rules` | 创建升级规则 |
| PUT | `/escalation-rules/:id` | 更新升级规则 |
| DELETE | `/escalation-rules/:id` | 删除升级规则 |
| GET | `/response-templates` | 列表快捷回复模板 |
| POST | `/response-templates` | 创建模板 |
| PUT | `/response-templates/:id` | 更新模板 |
| DELETE | `/response-templates/:id` | 删除模板 |
| GET | `/business-hours` | 获取工作时间配置 |
| POST | `/business-hours` | 创建工作时间 |
| PUT | `/business-hours/:id` | 更新工作时间 |
| GET | `/metrics/summary` | 获取指标摘要（总对话、AI 解决率、平均响应时间、CSAT） |

### 3.3 知识自学习 API（JWT 认证）

路由前缀：`/api/support/knowledge`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/drafts` | 获取 AI 自动提炼的 FAQ 草稿列表 |
| POST | `/drafts/:id/publish` | 审核通过并发布草稿，Body: `{ question?, answer?, category? }` 可修改后发布 |
| POST | `/drafts/:id/reject` | 拒绝并删除草稿 |
| POST | `/distill` | 手动触发对已解决对话的 FAQ 提炼 |
| POST | `/gap-report` | 生成知识盲区报告，Query: `{ days? }` 默认 7 天 |

### 3.4 Widget 外部 API（API Key 认证）

路由前缀：`/api/v1/widget`

认证方式：`Authorization: Bearer sk_xxx`，通过现有 `api_keys` 表验证，要求 key 的 scopes 包含 `widget:connect`。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/sessions` | 创建 Widget 会话。自动创建/更新客户档案，创建 support_conversation，创建关联的 chat_session。Body: `{ scopeId?, customerExternalId?, customerName?, customerEmail? }`。返回 `{ conversationId, sessionId, customerId, status }` |
| GET | `/sessions/:id/stream` | SSE 事件流（保活心跳 15s） |
| POST | `/sessions/:id/messages` | 发送消息并获取 AI 回复。调用 `chatService.processMessage` 获取 AI 响应。返回 `{ reply, sessionId, conversationId, status }`。AI 不可用时返回 503 + 友好提示 |
| GET | `/faq/search` | FAQ 搜索（预留，当前返回空结果） |

Widget 使用一个系统用户 ID `00000000-0000-0000-0000-000000000000` 作为 Chat Session 的 userId。

---

## 四、客服工作流引擎

### 4.1 工作流模板

系统内置一个名为 `Customer Service - AI First` 的工作流模板，自动为每个组织创建（首次使用时）。

工作流 DAG 结构：

```
Start(消息输入)
  → IntentClassifier(意图分类)
    → Condition(置信度 > 0.6?)
      ├─ YES → FaqLookup(FAQ 查找) → Agent(AI 回复-高置信) → ChannelReply(发送) → End
      └─ NO  → Agent(情绪分析) → Condition(紧急/负面?)
                ├─ YES → HumanApproval(转人工) → End
                └─ NO  → Agent(AI 回复-低置信) → ChannelReply(发送) → End
```

### 4.2 三个新的 Workflow 节点执行器

#### IntentClassifier（意图分类器）

- 节点类型：`intentClassifier`
- 输入：客户消息
- 输出：`{ intent, confidence, subIntent?, keywords[], suggestedAction, reasoning }`
- 使用 LLM 分类，默认意图类别：`general`、`complaint`、`inquiry`、`technical`、`billing`、`feedback`
- `suggestedAction` 可选值：`ai_reply`、`faq_lookup`、`human_handoff`、`skill_route`
- 支持自定义意图类别和 system prompt

#### FaqLookup（FAQ 查找）

- 节点类型：`faqLookup`
- 输入：查询文本
- 输出：`{ query, results[], totalResults, hasMatch, bestMatch }`
- 基于关键词匹配评分（精确匹配 +0.5，词项重叠 +0.3，标签匹配 +0.1，热度加成 +0.1）
- 支持 `maxResults`（默认 5）、`minScore`（默认 0.1）、`category` 过滤
- 匹配到的文章自动递增 `view_count`

#### ChannelReply（渠道回复）

- 节点类型：`channelReply`
- 输入：回复内容引用（如 `@{ai_reply_high.output.text}`）
- 行为：将回复写入关联的 Chat Session（作为 agent 类型消息）
- 支持 `fallbackReply`（引用为空时的兜底回复）
- 支持 `resolveOnReply`（回复后自动解决对话）

### 4.3 工作流触发

Widget 收到客户消息时，调用 `supportWorkflowService.executeForMessage()`，传入消息、sessionId、conversationId 等参数，触发工作流执行。工作流通过现有的 `workflowExecutionService` 运行。

---

## 五、知识自学习系统

### 5.1 对话蒸馏（FAQ 自动提炼）

- 触发时机：对话被标记为 `resolved` 后
- 流程：
  1. 加载对话的完整消息历史
  2. 调用 LLM 提取有价值的 Q&A 对
  3. 与现有 FAQ 去重（基于问题文本相似度）
  4. 创建 `draft` 状态的 FAQ 文章（带 `auto-distilled` 标签）
  5. 等待人工审核后发布或拒绝
- 支持批量蒸馏：`distillResolvedConversations(orgId, { hours: 24 })` 处理最近 N 小时内解决的对话

### 5.2 知识盲区检测

- 分析条件：最近 N 天内 AI 置信度 < 0.5、状态为 `pending_agent`、或情绪分数 < -0.3 的对话
- 流程：
  1. 加载问题对话的消息历史（最多 50 条对话，每条最多 20 条消息）
  2. 调用 LLM 分析共性，识别知识盲区
  3. 输出：`{ topic, frequency, suggestedCategory, summary }[]`
- 生成报告：包含盲区列表、现有 FAQ 覆盖统计、优先级建议

---

## 六、前端页面

### 6.1 导航

在侧边栏新增 **Support**（耳机图标 `Headphones`）导航项，路径 `/support`。

### 6.2 SupportWorkspace（`/support`）

客服工作台主界面，三栏布局：

**左栏 — 对话列表**
- 按状态筛选标签：全部 / 待处理(open) / 等待人工(pending_agent) / 已解决(resolved)
- 每条对话显示：客户名称、渠道图标、最新消息预览、时间、优先级标签、状态标签
- 自动刷新（轮询间隔 10s）

**中栏 — 对话详情**
- 消息气泡列表（区分客户消息和 AI/客服回复）
- 底部输入框，支持发送回复
- 操作按钮：分配客服、解决、关闭、转人工

**右栏 — 客户信息面板**
- 客户头像、姓名、邮箱、电话
- 标签和自定义字段
- 历史对话列表

### 6.3 SupportSettings（`/support/settings`）

客服设置页面，包含四个 Tab：

**客服团队（Agent Groups）**
- 创建/编辑/删除技能组
- 配置路由策略（轮询 / 最少负载 / 手动）
- 管理组成员

**升级规则（Escalation Rules）**
- 创建/编辑/删除规则
- 配置触发条件和动作
- 规则优先级排序

**快捷回复（Response Templates）**
- 创建/编辑/删除模板
- 支持分类和快捷键
- 按渠道类型筛选

**工作时间（Business Hours）**
- 配置每周工作时间（周一到周日）
- 时区设置
- 节假日配置
- 非工作时间自动回复消息

### 6.4 SupportAnalytics（`/support/analytics`）

客服分析仪表盘：
- 核心指标卡片：总对话数、AI 解决率、平均首次响应时间、平均 CSAT
- 按日期的趋势图
- 按渠道/状态的分布

### 6.5 SupportKnowledge（`/support/knowledge`）

知识自学习管理页面，三个 Tab：

**FAQ 草稿（Drafts）**
- 展示 AI 自动提炼的 FAQ 草稿列表
- 每条草稿显示：问题、答案、分类、置信度
- 操作：发布（可编辑后发布）/ 拒绝

**知识盲区（Gaps）**
- 生成知识盲区报告
- 展示盲区列表：主题、频率、建议分类
- 报告摘要

**自动学习（Auto-learn）**
- 手动触发对话蒸馏
- 查看蒸馏状态和统计

---

## 七、后端服务清单

| 服务 | 文件 | 职责 |
|------|------|------|
| SupportService | `support.service.ts` | 对话 CRUD、客户档案管理、状态流转 |
| WidgetAuthService | `widget-auth.service.ts` | Widget API Key 认证（SHA256 哈希匹配，校验 `widget:connect` scope） |
| SupportWorkflowService | `support-workflow.service.ts` | 客服工作流模板管理和执行触发 |
| SupportKnowledgeService | `support-knowledge.service.ts` | FAQ 蒸馏、知识盲区检测、报告生成 |
| BusinessHoursService | `business-hours.service.ts` | 工作时间判断 |
| EscalationService | `escalation.service.ts` | 升级规则匹配和执行 |
| SupportMetricsService | `support-metrics.service.ts` | 每日指标聚合 |
| SurveyService | `survey.service.ts` | CSAT 满意度调查 |

Repository 层：
| Repository | 职责 |
|------------|------|
| `support.repository.ts` | support_conversations CRUD |
| `customer-profile.repository.ts` | customer_profiles CRUD，支持按 external_id / email 查找 |
| `faq.repository.ts` | faq_articles CRUD，支持按 scope / category / status 筛选 |

---

## 八、i18n 翻译键

需要新增的翻译键（中英文）：

```
nav.support = "客服" / "Support"
support.workspace = "客服工作台" / "Support Workspace"
support.settings = "客服设置" / "Support Settings"
support.analytics = "客服分析" / "Support Analytics"
support.knowledge = "知识管理" / "Knowledge Management"
support.conversations = "对话" / "Conversations"
support.customers = "客户" / "Customers"
support.faq = "FAQ" / "FAQ"
support.agentGroups = "客服团队" / "Agent Groups"
support.escalationRules = "升级规则" / "Escalation Rules"
support.responseTemplates = "快捷回复" / "Response Templates"
support.businessHours = "工作时间" / "Business Hours"
support.drafts = "FAQ 草稿" / "FAQ Drafts"
support.gaps = "知识盲区" / "Knowledge Gaps"
support.autoLearn = "自动学习" / "Auto-learn"
support.resolve = "解决" / "Resolve"
support.close = "关闭" / "Close"
support.handoff = "转人工" / "Transfer to Human"
support.assign = "分配" / "Assign"
```

（完整翻译键约 96 条，覆盖所有页面文案）

---

## 九、关键设计决策

1. **Widget 认证使用现有 API Key 体系**：不新建认证机制，复用 `api_keys` 表，通过 `widget:connect` scope 控制权限。Widget 使用固定的系统用户 ID（全零 UUID）作为 Chat Session 的 userId。

2. **对话与 Chat Session 关联**：每个 support_conversation 关联一个 chat_session，复用现有的消息存储和 AI 对话能力。客服人员的回复也写入 Chat Session。

3. **工作流复用现有引擎**：客服工作流使用现有的 Workflow 执行引擎，新增三个节点执行器（IntentClassifier、FaqLookup、ChannelReply），注册到现有的 executor-registry。

4. **FAQ 查找使用关键词匹配**：当前版本使用关键词评分（非向量语义搜索），预留了 RAG 语义搜索的扩展点。

5. **知识自学习为异步流程**：对话蒸馏和盲区检测都是异步操作，可由定时任务或手动触发，不阻塞客服工作流。

6. **前端使用 `restClient`**：所有前端 API 调用使用项目统一的 `restClient`（而非独立的 `apiClient`）。
