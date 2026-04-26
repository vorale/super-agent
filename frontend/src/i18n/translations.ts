import type { TranslationData } from '@/types'

export const translations: TranslationData = {
  // Navigation
  'nav.dashboard': {
    en: 'Dashboard',
    cn: '仪表板'
  },
  'nav.chat': {
    en: 'Chat',
    cn: '对话'
  },
  'nav.workflow': {
    en: 'Workflow',
    cn: '工作流'
  },
  'nav.agents': {
    en: 'Agents',
    cn: '智能体'
  },
  'nav.projects': {
    en: 'Projects',
    cn: '项目'
  },
  'nav.tools': {
    en: 'Tools',
    cn: '工具'
  },
  'nav.apps': {
    en: 'Apps',
    cn: '应用'
  },
  'nav.starred': {
    en: 'Showcase',
    cn: '企业Agent大赏'
  },
  'nav.tasks': {
    en: 'Tasks',
    cn: '任务'
  },

  // Header
  'header.commandCenter': {
    en: 'Command Center',
    cn: '指挥中心'
  },
  'header.productionLive': {
    en: 'Production Live',
    cn: '生产环境'
  },
  'header.globalView': {
    en: 'Global View',
    cn: '全局视图'
  },

  // Dashboard
  'dashboard.title': {
    en: 'Dashboard',
    cn: '仪表板'
  },
  'dashboard.activeAgents': {
    en: 'Active Agents',
    cn: '活跃智能体'
  },
  'dashboard.tasksAutomated': {
    en: 'Tasks Automated',
    cn: '自动化任务'
  },
  'dashboard.slaCompliance': {
    en: 'SLA Compliance',
    cn: 'SLA合规率'
  },
  'dashboard.activeTasks': {
    en: 'Active Tasks',
    cn: '进行中任务'
  },
  'dashboard.createBusinessScope': {
    en: 'Create Business Scope',
    cn: '创建业务范围'
  },
  'dashboard.addNew': {
    en: 'Add New Department',
    cn: '添加新部门'
  },
  'dashboard.unassigned': {
    en: 'Unassigned',
    cn: '未分配'
  },
  'dashboard.trendThisWeek': {
    en: '+2 this week',
    cn: '+2 本周'
  },
  'dashboard.systemHealthy': {
    en: 'System Healthy',
    cn: '系统健康'
  },

  // Create Scope Card
  'createScope.subtitle': {
    en: 'Add new department with AI agents',
    cn: '添加新部门及AI智能体'
  },

  // Task Intelligence Card
  'taskIntel.title': {
    en: 'Task Intelligence',
    cn: '任务智能'
  },
  'taskIntel.active': {
    en: 'Active',
    cn: '活跃'
  },

  // Departments
  'department.hr': {
    en: 'Human Resources',
    cn: '人力资源'
  },
  'department.it': {
    en: 'Information Technology',
    cn: '信息技术'
  },
  'department.marketing': {
    en: 'Marketing',
    cn: '市场营销'
  },
  'department.sales': {
    en: 'Sales',
    cn: '销售'
  },
  'department.support': {
    en: 'Support',
    cn: '客户支持'
  },


  // Agent Status
  'status.active': {
    en: 'Active',
    cn: '活跃'
  },
  'status.busy': {
    en: 'Busy',
    cn: '忙碌'
  },
  'status.offline': {
    en: 'Offline',
    cn: '离线'
  },

  // Agent Management
  'agents.title': {
    en: 'Agent Management',
    cn: '智能体管理'
  },
  'agents.profile': {
    en: 'Agent Profile',
    cn: '智能体档案'
  },
  'agents.metrics': {
    en: 'Performance Metrics',
    cn: '性能指标'
  },
  'agents.taskCount': {
    en: 'Task Count',
    cn: '任务数量'
  },
  'agents.responseRate': {
    en: 'Response Rate',
    cn: '响应率'
  },
  'agents.avgResponseTime': {
    en: 'Avg Response Time',
    cn: '平均响应时间'
  },
  'agents.scope': {
    en: 'Operational Scope',
    cn: '操作范围'
  },
  'agents.tools': {
    en: 'Skills',
    cn: '子代理技能'
  },
  'agents.systemPrompt': {
    en: 'System Prompt',
    cn: '系统提示词'
  },
  'agents.executionLogs': {
    en: 'Execution Logs',
    cn: '执行日志'
  },
  'agents.selectPrompt': {
    en: 'Select an agent from the list to view their profile, metrics, and configuration.',
    cn: '从列表中选择一个智能体以查看其档案、指标和配置。'
  },
  'agents.confirmRemove': {
    en: 'Are you sure you want to remove this agent? This action cannot be undone.',
    cn: '确定要移除此智能体吗？此操作无法撤销。'
  },

  // Agent Configuration
  'agentConfig.title': {
    en: 'Agent Configuration',
    cn: '智能体配置'
  },
  'agentConfig.agentId': {
    en: 'Agent ID',
    cn: '智能体ID'
  },
  'agentConfig.internalName': {
    en: 'Internal Name',
    cn: '内部名称'
  },
  'agentConfig.displayName': {
    en: 'Display Name',
    cn: '显示名称'
  },
  'agentConfig.description': {
    en: 'Description',
    cn: '描述'
  },
  'agentConfig.agentType': {
    en: 'Agent Type',
    cn: '智能体类型'
  },
  'agentConfig.modelProvider': {
    en: 'Model Provider',
    cn: '模型提供商'
  },
  'agentConfig.modelId': {
    en: 'Model ID',
    cn: '模型ID'
  },
  'agentConfig.orchestrator': {
    en: 'Orchestrator',
    cn: '编排器'
  },
  'agentConfig.worker': {
    en: 'Worker',
    cn: '工作者'
  },
  'agentConfig.supervisor': {
    en: 'Supervisor',
    cn: '监督者'
  },
  'agentConfig.basicInfo': {
    en: 'Basic Information',
    cn: '基本信息'
  },
  'agentConfig.aiConfig': {
    en: 'AI Configuration',
    cn: 'AI配置'
  },
  'agentConfig.capabilities': {
    en: 'Capabilities',
    cn: '能力配置'
  },
  'agentConfig.role': {
    en: 'Role',
    cn: '角色'
  },
  'agentConfig.avatar': {
    en: 'Avatar',
    cn: '头像'
  },
  'agentConfig.status': {
    en: 'Status',
    cn: '状态'
  },
  'agentConfig.businessScope': {
    en: 'Business Scope',
    cn: '业务范围'
  },
  'agentConfig.operationalScope': {
    en: 'Operational Scope',
    cn: '操作范围'
  },
  'agentConfig.assignedTools': {
    en: 'Skills',
    cn: '子代理技能'
  },
  'agentConfig.systemPrompt': {
    en: 'System Prompt',
    cn: '系统提示词'
  },
  'agentConfig.identity': {
    en: 'Identity',
    cn: '身份'
  },
  'agentConfig.name': {
    en: 'Name',
    cn: '名称'
  },
  'agentConfig.instructions': {
    en: 'Instructions',
    cn: '指令'
  },
  'agentConfig.tools': {
    en: 'Tools',
    cn: '工具'
  },
  'agentConfig.handoffs': {
    en: 'Handoffs',
    cn: '交接'
  },


  // Chat Interface
  'chat.title': {
    en: 'Chat',
    cn: '对话'
  },
  'chat.placeholder': {
    en: 'Type your message...',
    cn: '输入您的消息...'
  },
  'chat.placeholderWithMention': {
    en: 'Type your message... Use @ to mention an agent',
    cn: '输入您的消息... 输入 @ 指定智能体回答'
  },
  'chat.mentionAgent': {
    en: 'Mention an agent',
    cn: '提及智能体'
  },
  'chat.removeMention': {
    en: 'Remove mention',
    cn: '移除提及'
  },
  'chat.mentionRouteHint': {
    en: 'This message will be routed to this agent',
    cn: '此消息将由该智能体回答'
  },
  'chat.send': {
    en: 'Send',
    cn: '发送'
  },
  'chat.typing': {
    en: 'AI is typing...',
    cn: 'AI正在输入...'
  },
  'chat.selectSop': {
    en: 'Select SOP Context',
    cn: '选择SOP上下文'
  },
  'chat.contextSwitch': {
    en: 'Context switched to',
    cn: '上下文已切换至'
  },
  'chat.memories': {
    en: 'Memories',
    cn: '记忆'
  },
  'chat.useCases': {
    en: 'Use Cases',
    cn: '使用场景'
  },
  'chat.relatedLinks': {
    en: 'Related Links',
    cn: '相关链接'
  },
  'chat.quickQuestions': {
    en: 'Quick Questions',
    cn: '快捷问题'
  },

  // Workflow Designer
  'workflow.title': {
    en: 'Workflow Designer',
    cn: '工作流设计器'
  },
  'workflow.version': {
    en: 'Version',
    cn: '版本'
  },
  'workflow.official': {
    en: 'Official',
    cn: '正式版'
  },
  'workflow.deployToTest': {
    en: 'Deploy to Test',
    cn: '部署到测试'
  },
  'workflow.category.hr': {
    en: 'HR',
    cn: '人力资源'
  },
  'workflow.category.deployment': {
    en: 'Deployment',
    cn: '部署'
  },
  'workflow.category.marketing': {
    en: 'Marketing',
    cn: '市场营销'
  },
  'workflow.category.support': {
    en: 'Support',
    cn: '客户支持'
  },
  'workflow.copilot.title': {
    en: 'AI Copilot',
    cn: 'AI助手'
  },
  'workflow.copilot.placeholder': {
    en: 'Describe workflow changes in natural language...',
    cn: '用自然语言描述工作流变更...'
  },
  'workflow.copilot.hint': {
    en: 'Press Enter to apply changes. Shift+Enter for new line.',
    cn: '按回车应用更改。Shift+回车换行。'
  },
  'workflow.copilot.error': {
    en: 'Failed to apply changes. Please try again.',
    cn: '应用更改失败，请重试。'
  },
  'workflow.copilot.success': {
    en: 'Workflow updated successfully',
    cn: '工作流更新成功'
  },
  'workflow.import': {
    en: 'Import from Image',
    cn: '从图片导入'
  },
  'workflow.create': {
    en: 'Create Workflow',
    cn: '创建工作流'
  },
  'workflow.createNew': {
    en: 'Create New Workflow',
    cn: '创建新工作流'
  },
  'workflow.workflowName': {
    en: 'Workflow Name',
    cn: '工作流名称'
  },
  'workflow.import.title': {
    en: 'Import Workflow from Image',
    cn: '从图片导入工作流'
  },
  'workflow.import.dropzone': {
    en: 'Drop a flowchart image here or click to browse',
    cn: '拖放流程图图片到此处或点击浏览'
  },
  'workflow.import.supportedFormats': {
    en: 'Supports PNG, JPG, JPEG, GIF',
    cn: '支持 PNG、JPG、JPEG、GIF'
  },
  'workflow.import.analyzing': {
    en: 'Analyzing flowchart...',
    cn: '正在分析流程图...'
  },
  'workflow.import.invalidFileType': {
    en: 'Please upload an image file',
    cn: '请上传图片文件'
  },
  'workflow.import.processingError': {
    en: 'Failed to process image. Please try again.',
    cn: '处理图片失败，请重试。'
  },
  'workflow.import.detectedAgents': {
    en: 'Detected Agents',
    cn: '检测到的智能体'
  },
  'workflow.import.detectedFlow': {
    en: 'Detected Flow Steps',
    cn: '检测到的流程步骤'
  },
  'workflow.import.tryAnother': {
    en: 'Try Another Image',
    cn: '尝试其他图片'
  },
  'workflow.import.accept': {
    en: 'Accept & Create Workflow',
    cn: '接受并创建工作流'
  },
  'workflow.detectedAgents': {
    en: 'Detected Agents',
    cn: '检测到的智能体'
  },
  'workflow.detectedFlow': {
    en: 'Detected Flow',
    cn: '检测到的流程'
  },
  'workflow.deleteWorkflow': {
    en: 'Delete Workflow',
    cn: '删除工作流'
  },
  'workflow.deleteConfirmMessage': {
    en: 'Are you sure you want to delete',
    cn: '确定要删除'
  },
  'workflow.deleteConfirmSuffix': {
    en: '? This action cannot be undone.',
    cn: ' 吗？此操作无法撤销。'
  },


  // Task Audit Log
  'taskAudit.title': {
    en: 'Task Audit Log',
    cn: '任务审计日志'
  },

  // Task Execution Center
  'taskExec.title': {
    en: 'Task Execution Center',
    cn: '任务执行中心'
  },
  'taskExec.allSystemsNominal': {
    en: 'All Systems Nominal',
    cn: '所有系统正常'
  },
  'taskExec.started': {
    en: 'Started',
    cn: '开始于'
  },
  'taskExec.workflow': {
    en: 'Workflow',
    cn: '工作流'
  },
  'taskExec.progress': {
    en: 'Task Progress',
    cn: '任务进度'
  },
  'taskExec.logs': {
    en: 'Logs',
    cn: '日志'
  },
  'taskExec.noTasks': {
    en: 'No active tasks',
    cn: '暂无活跃任务'
  },
  'taskExec.status.running': {
    en: 'Running',
    cn: '运行中'
  },
  'taskExec.status.success': {
    en: 'Success',
    cn: '成功'
  },
  'taskExec.status.failed': {
    en: 'Failed',
    cn: '失败'
  },

  // Task Monitor (legacy)
  'tasks.title': {
    en: 'Task Monitor',
    cn: '任务监控'
  },
  'tasks.agent': {
    en: 'Agent',
    cn: '智能体'
  },
  'tasks.description': {
    en: 'Description',
    cn: '描述'
  },
  'tasks.workflow': {
    en: 'Workflow',
    cn: '工作流'
  },
  'tasks.status': {
    en: 'Status',
    cn: '状态'
  },
  'tasks.time': {
    en: 'Time',
    cn: '时间'
  },
  'tasks.action': {
    en: 'Action',
    cn: '操作'
  },
  'tasks.filterByAgent': {
    en: 'Filter by Agent',
    cn: '按智能体筛选'
  },
  'tasks.exportCsv': {
    en: 'Export CSV',
    cn: '导出CSV'
  },
  'tasks.status.complete': {
    en: 'Complete',
    cn: '已完成'
  },
  'tasks.status.running': {
    en: 'Running',
    cn: '运行中'
  },
  'tasks.status.failed': {
    en: 'Failed',
    cn: '失败'
  },
  'tasks.viewDetails': {
    en: 'View Details',
    cn: '查看详情'
  },

  // Tools & Capabilities
  'tools.title': {
    en: 'Tools & Capabilities',
    cn: '工具与能力'
  },
  'tools.search': {
    en: 'Search capabilities...',
    cn: '搜索能力...'
  },
  'tools.category.videoIntelligence': {
    en: 'Video Intelligence',
    cn: '视频智能'
  },
  'tools.category.knowledgeData': {
    en: 'Knowledge & Data',
    cn: '知识与数据'
  },
  'tools.category.communication': {
    en: 'Communication',
    cn: '通信'
  },
  'tools.category.infrastructure': {
    en: 'Infrastructure',
    cn: '基础设施'
  },


  // MCP Configuration
  'mcpConfig.title': {
    en: 'MCP Server Configuration',
    cn: 'MCP服务器配置'
  },
  'mcpConfig.subtitle': {
    en: 'Manage Model Context Protocol servers and integrations',
    cn: '管理模型上下文协议服务器和集成'
  },
  'mcpConfig.addServer': {
    en: 'Add Server',
    cn: '添加服务器'
  },
  'mcpConfig.servers': {
    en: 'Servers',
    cn: '服务器'
  },
  'mcpConfig.noServers': {
    en: 'No servers configured',
    cn: '未配置服务器'
  },
  'mcpConfig.newServer': {
    en: 'New MCP Server',
    cn: '新MCP服务器'
  },
  'mcpConfig.editServer': {
    en: 'Edit MCP Server',
    cn: '编辑MCP服务器'
  },
  'mcpConfig.name': {
    en: 'Server Name',
    cn: '服务器名称'
  },
  'mcpConfig.description': {
    en: 'Description',
    cn: '描述'
  },
  'mcpConfig.hostAddress': {
    en: 'Host Address',
    cn: '主机地址'
  },
  'mcpConfig.oauthConfig': {
    en: 'OAuth Configuration',
    cn: 'OAuth配置'
  },
  'mcpConfig.clientId': {
    en: 'Client ID',
    cn: '客户端ID'
  },
  'mcpConfig.clientSecret': {
    en: 'Client Secret',
    cn: '客户端密钥'
  },
  'mcpConfig.tokenUrl': {
    en: 'Token URL',
    cn: '令牌URL'
  },
  'mcpConfig.scope': {
    en: 'Scope',
    cn: '范围'
  },
  'mcpConfig.headers': {
    en: 'Custom Headers (JSON)',
    cn: '自定义请求头 (JSON)'
  },
  'mcpConfig.headersHint': {
    en: 'Optional: Add custom HTTP headers as JSON',
    cn: '可选：以JSON格式添加自定义HTTP请求头'
  },
  'mcpConfig.testConnection': {
    en: 'Test Connection',
    cn: '测试连接'
  },
  'mcpConfig.status.active': {
    en: 'Active',
    cn: '活跃'
  },
  'mcpConfig.status.inactive': {
    en: 'Inactive',
    cn: '未激活'
  },
  'mcpConfig.status.error': {
    en: 'Error',
    cn: '错误'
  },

  // Knowledge Base
  'knowledge.title': {
    en: 'Knowledge Base',
    cn: '知识库'
  },
  'knowledge.subtitle': {
    en: 'Manage documents and knowledge bases for RAG retrieval',
    cn: '管理用于RAG检索的文档和知识库'
  },
  'knowledge.upload': {
    en: 'Upload Document',
    cn: '上传文档'
  },
  'knowledge.documentTitle': {
    en: 'Document Title',
    cn: '文档标题'
  },
  'knowledge.category': {
    en: 'Category',
    cn: '分类'
  },
  'knowledge.fileName': {
    en: 'File Name',
    cn: '文件名'
  },
  'knowledge.fileType': {
    en: 'File Type',
    cn: '文件类型'
  },
  'knowledge.uploadTime': {
    en: 'Upload Time',
    cn: '上传时间'
  },
  'knowledge.indexingStatus': {
    en: 'Indexing Status',
    cn: '索引状态'
  },
  'knowledge.status.indexed': {
    en: 'Indexed',
    cn: '已索引'
  },
  'knowledge.status.processing': {
    en: 'Processing',
    cn: '处理中'
  },
  'knowledge.status.error': {
    en: 'Error',
    cn: '错误'
  },
  'knowledge.createKb': {
    en: 'Create Knowledge Base',
    cn: '创建知识库'
  },
  'knowledge.vectorDb': {
    en: 'Vector Database',
    cn: '向量数据库'
  },
  'knowledge.databaseEndpoint': {
    en: 'Database Endpoint',
    cn: '数据库端点'
  },
  'knowledge.storageUri': {
    en: 'S3 Storage URI',
    cn: 'S3存储URI'
  },
  'knowledge.sync': {
    en: 'Sync All',
    cn: '同步全部'
  },
  'knowledge.documents': {
    en: 'Documents',
    cn: '文档'
  },
  'knowledge.noDocuments': {
    en: 'No documents uploaded yet',
    cn: '尚未上传任何文档'
  },
  'knowledge.supportedFormats': {
    en: 'Supported formats: PDF, TXT, MD, DOCX',
    cn: '支持的格式：PDF、TXT、MD、DOCX'
  },

  // Infrastructure Configuration
  'infra.title': {
    en: 'Infrastructure Configuration',
    cn: '基础设施配置'
  },
  'infra.subtitle': {
    en: 'Configure deployment infrastructure for your agents',
    cn: '为您的智能体配置部署基础设施'
  },
  'infra.framework': {
    en: 'Application Framework',
    cn: '应用框架'
  },
  'infra.database': {
    en: 'Database Engine',
    cn: '数据库引擎'
  },
  'infra.deploy': {
    en: 'Deploy',
    cn: '部署'
  },
  'infra.selectFramework': {
    en: 'Select a framework',
    cn: '选择框架'
  },
  'infra.selectDatabase': {
    en: 'Select a database',
    cn: '选择数据库'
  },
  'infra.summary': {
    en: 'Configuration Summary',
    cn: '配置摘要'
  },
  'infra.selectBoth': {
    en: 'Please select both a framework and database to deploy',
    cn: '请同时选择框架和数据库以进行部署'
  },

  // Admin Menu
  'admin.languageSync': {
    en: 'Language Sync',
    cn: '语言同步'
  },
  'admin.mcpConfig': {
    en: 'MCP Configuration',
    cn: 'MCP配置'
  },
  'admin.skillConfig': {
    en: 'Skill Configuration',
    cn: '技能配置'
  },
  'admin.restApiConfig': {
    en: 'REST API Config',
    cn: 'REST API配置'
  },
  'admin.knowledgeBase': {
    en: 'Knowledge Base',
    cn: '知识库'
  },
  'admin.frameworkSettings': {
    en: 'Framework Settings',
    cn: '框架设置'
  },
  'admin.settings': {
    en: 'Members & Permissions',
    cn: '成员与权限'
  },
  'admin.logout': {
    en: 'Log Out',
    cn: '退出登录'
  },

  // Common Actions
  'common.save': {
    en: 'Save',
    cn: '保存'
  },
  'common.cancel': {
    en: 'Cancel',
    cn: '取消'
  },
  'common.delete': {
    en: 'Delete',
    cn: '删除'
  },
  'common.edit': {
    en: 'Edit',
    cn: '编辑'
  },
  'common.create': {
    en: 'Create',
    cn: '创建'
  },
  'common.search': {
    en: 'Search',
    cn: '搜索'
  },
  'common.filter': {
    en: 'Filter',
    cn: '筛选'
  },
  'common.loading': {
    en: 'Loading...',
    cn: '加载中...'
  },
  'common.error': {
    en: 'Error',
    cn: '错误'
  },
  'common.success': {
    en: 'Success',
    cn: '成功'
  },
  'common.retry': {
    en: 'Retry',
    cn: '重试'
  },
  'common.close': {
    en: 'Close',
    cn: '关闭'
  },
  'common.confirm': {
    en: 'Confirm',
    cn: '确认'
  },
  'common.allAgents': {
    en: 'All Agents',
    cn: '所有智能体'
  },
  'common.remove': {
    en: 'Remove',
    cn: '移除'
  },
  'common.disable': {
    en: 'Disable',
    cn: '禁用'
  },
  'common.enable': {
    en: 'Enable',
    cn: '启用'
  },

  // Validation Messages
  'validation.required': {
    en: 'This field is required',
    cn: '此字段为必填项'
  },
  'validation.invalidJson': {
    en: 'Invalid JSON format',
    cn: 'JSON格式无效'
  },
  'validation.invalidUrl': {
    en: 'Invalid URL format',
    cn: 'URL格式无效'
  },

  // Toast Messages
  'toast.saveSuccess': {
    en: 'Changes saved successfully',
    cn: '更改已成功保存'
  },
  'toast.saveError': {
    en: 'Failed to save changes',
    cn: '保存更改失败'
  },
  'toast.uploadSuccess': {
    en: 'File uploaded successfully',
    cn: '文件上传成功'
  },
  'toast.uploadError': {
    en: 'Failed to upload file',
    cn: '文件上传失败'
  },
  'toast.connectionError': {
    en: 'Connection error. Please try again.',
    cn: '连接错误，请重试。'
  },

  // Business Scope Creator
  'businessScope.create': {
    en: 'Create Business Scope',
    cn: '创建业务范围'
  },
  'businessScope.inputName': {
    en: 'Enter business domain name',
    cn: '输入业务领域名称'
  },
  'businessScope.generating': {
    en: 'Generating agent team',
    cn: '正在生成智能体团队'
  },
  'businessScope.preview': {
    en: 'Preview generated agents',
    cn: '预览生成的智能体'
  },
  'businessScope.customizing': {
    en: 'Customize appearance',
    cn: '自定义外观'
  },
  'businessScope.saving': {
    en: 'Saving',
    cn: '正在保存'
  },
  'businessScope.errorOccurred': {
    en: 'An error occurred',
    cn: '发生错误'
  },
  'businessScope.name': {
    en: 'Business Scope Name',
    cn: '业务范围名称'
  },
  'businessScope.namePlaceholder': {
    en: 'e.g., Asset Management, Human Resources, Customer Success',
    cn: '例如：逾期资产治理、Human Resources、Customer Success'
  },
  'businessScope.uploadDocs': {
    en: 'Upload Reference Documents (Optional)',
    cn: '上传参考文档（可选）'
  },
  'businessScope.generateAgents': {
    en: 'Generate Agents',
    cn: '生成智能体'
  },
  'businessScope.regenerate': {
    en: 'Regenerate',
    cn: '重新生成'
  },
  'businessScope.customizeAppearance': {
    en: 'Customize Appearance',
    cn: '自定义外观'
  },
  'businessScope.confirmCreate': {
    en: 'Confirm Create',
    cn: '确认创建'
  },
  'businessScope.backToPreview': {
    en: 'Back to Preview',
    cn: '返回预览'
  },
  'businessScope.retry': {
    en: 'Retry',
    cn: '重试'
  },
  'businessScope.confirmCancel': {
    en: 'Confirm Cancel?',
    cn: '确认取消？'
  },
  'businessScope.cancelWarning': {
    en: 'Generation is in progress. Canceling will lose all progress. Are you sure?',
    cn: '生成过程正在进行中，取消将丢失所有进度。确定要取消吗？'
  },
  'businessScope.continueGeneration': {
    en: 'Continue Generation',
    cn: '继续生成'
  },
  'businessScope.confirmCancelBtn': {
    en: 'Confirm Cancel',
    cn: '确认取消'
  },
  'businessScope.generatedCount': {
    en: 'Generated {count} agents',
    cn: '已生成 {count} 个智能体'
  },
  'businessScope.selectedCount': {
    en: '{selected} / {total} selected',
    cn: '{selected} / {total} 已选择'
  },
  'businessScope.savingProgress': {
    en: 'Creating business scope and {count} agents',
    cn: '正在创建业务范围和 {count} 个智能体'
  },
  'businessScope.createFailed': {
    en: 'Creation Failed',
    cn: '创建失败'
  },
  'businessScope.unknownError': {
    en: 'An unknown error occurred. Please try again.',
    cn: '发生未知错误，请重试'
  },

  // Generation Progress
  'generation.complete': {
    en: 'Generation Complete',
    cn: '生成完成'
  },
  'generation.inProgress': {
    en: 'Generating...',
    cn: '正在生成...'
  },
  'generation.scopeCreated': {
    en: '"{name}" business scope has been successfully created',
    cn: '"{name}" 业务范围已成功创建'
  },
  'generation.generatingTeam': {
    en: 'Generating agent team for "{name}"',
    cn: '正在为 "{name}" 生成智能体团队'
  },
  'generation.failed': {
    en: 'Generation Failed',
    cn: '生成失败'
  },
  'generation.retryHint': {
    en: 'You can click "Retry" to restart generation',
    cn: '您可以点击"重试"按钮重新开始生成'
  },
  'generation.success': {
    en: 'Generation Successful',
    cn: '生成成功'
  },
  'generation.successMessage': {
    en: 'Successfully generated {count} agents. Please preview and confirm in the next step.',
    cn: '已成功生成 {count} 个智能体，请在下一步预览和确认'
  },
  'generation.step.businessAnalysis': {
    en: 'Business Analysis',
    cn: '业务分析'
  },
  'generation.step.documentAnalysis': {
    en: 'Document Analysis',
    cn: '文档分析'
  },
  'generation.step.roleIdentification': {
    en: 'Role Identification',
    cn: '角色识别'
  },
  'generation.step.agentCreation': {
    en: 'Agent Creation',
    cn: '智能体创建'
  },
  'generation.step.documentGeneration': {
    en: 'Document Generation',
    cn: '文档生成'
  },
  'generation.step.finalization': {
    en: 'Finalization',
    cn: '完成'
  },

  // Document Uploader
  'docUploader.removeDoc': {
    en: 'Remove document',
    cn: '移除文档'
  },
  'docUploader.dropOrClick': {
    en: 'Drop files here or click to upload',
    cn: '拖拽文件到此处或点击上传'
  },
  'docUploader.releaseToUpload': {
    en: 'Release to upload files',
    cn: '释放以上传文件'
  },
  'docUploader.supportedFormats': {
    en: 'Supports PDF, DOC, DOCX, TXT, MD formats',
    cn: '支持 PDF, DOC, DOCX, TXT, MD 格式'
  },
  'docUploader.unsupportedType': {
    en: 'Unsupported file type: {files}',
    cn: '不支持的文件类型: {files}'
  },
  'docUploader.uploadedCount': {
    en: 'Uploaded {count} files',
    cn: '已上传 {count} 个文件'
  },
  'docUploader.helperText': {
    en: 'Uploading documents helps AI better understand your business scenario (optional)',
    cn: '上传文档可以帮助 AI 更好地理解您的业务场景（可选）'
  },

  // Agent Preview Card
  'agentPreview.removed': {
    en: 'Removed',
    cn: '已移除'
  },
  'agentPreview.restore': {
    en: 'Restore this agent',
    cn: '恢复此智能体'
  },
  'agentPreview.remove': {
    en: 'Remove this agent',
    cn: '移除此智能体'
  },
  'agentPreview.keepOne': {
    en: 'At least one agent must be kept',
    cn: '至少需要保留一个智能体'
  },
  'agentPreview.responsibilities': {
    en: 'Core Responsibilities',
    cn: '核心职责'
  },
  'agentPreview.systemPrompt': {
    en: 'System Prompt Summary',
    cn: '系统提示词摘要'
  },
  'agentPreview.suggestedTools': {
    en: 'Suggested Tools',
    cn: '建议工具'
  },
  'agentPreview.capabilities': {
    en: 'Core Capabilities',
    cn: '核心能力'
  },

  // Business Scope Customizer
  'customizer.preview': {
    en: 'Preview',
    cn: '预览'
  },
  'customizer.agentCount': {
    en: '{count} agents',
    cn: '{count} 个智能体'
  },
  'customizer.recommendation': {
    en: 'Recommended based on business domain',
    cn: '根据业务领域推荐'
  },
  'customizer.applyRecommendation': {
    en: 'Apply Recommendation',
    cn: '应用推荐'
  },
  'customizer.clickToApply': {
    en: 'Click to apply recommended icon and color',
    cn: '点击应用推荐的图标和颜色'
  },
  'customizer.selectIcon': {
    en: 'Select Icon',
    cn: '选择图标'
  },
  'customizer.selectColor': {
    en: 'Select Color',
    cn: '选择颜色'
  },
  'customizer.description': {
    en: 'Description (Optional)',
    cn: '描述（可选）'
  },
  'customizer.descriptionPlaceholder': {
    en: 'Enter a brief description of the business scope...',
    cn: '输入业务范围的简要描述...'
  },
  'customizer.color.green': {
    en: 'Green',
    cn: '绿色'
  },
  'customizer.color.blue': {
    en: 'Blue',
    cn: '蓝色'
  },
  'customizer.color.orange': {
    en: 'Orange',
    cn: '橙色'
  },
  'customizer.color.purple': {
    en: 'Purple',
    cn: '紫色'
  },
  'customizer.color.pink': {
    en: 'Pink',
    cn: '粉色'
  },
  'customizer.color.cyan': {
    en: 'Cyan',
    cn: '青色'
  },
  'customizer.color.redOrange': {
    en: 'Red Orange',
    cn: '红橙'
  },
  'customizer.color.grayBlue': {
    en: 'Gray Blue',
    cn: '灰蓝'
  },
  'customizer.color.brown': {
    en: 'Brown',
    cn: '棕色'
  },
  'customizer.color.indigo': {
    en: 'Indigo',
    cn: '靛蓝'
  },

  // Data Connectors
  'connector.title': {
    en: 'Data Connectors',
    cn: '数据连接器'
  },
  'connector.manage': {
    en: 'Manage Connectors',
    cn: '管理连接器'
  },
  'connector.description': {
    en: 'Securely connect to external systems (Gmail, Salesforce, BigQuery, etc.) via AgentCore Gateway. Zero credential exposure in agent processes.',
    cn: '通过 AgentCore Gateway 安全连接外部系统（Gmail、Salesforce、BigQuery 等），Agent 进程中零凭证暴露。'
  },
  'connector.connected': {
    en: 'Connected',
    cn: '已连接'
  },
  'connector.catalog': {
    en: 'Connector Catalog',
    cn: '连接器目录'
  },
  'connector.noConnectors': {
    en: 'No data connectors',
    cn: '暂无数据连接器'
  },
  'connector.noConnectorsHint': {
    en: 'Add connectors from the catalog below',
    cn: '从下方目录添加连接器'
  },
  'connector.connect': {
    en: 'Connect',
    cn: '连接'
  },
  'connector.alreadyConnected': {
    en: 'Connected',
    cn: '已连接'
  },
  'connector.search': {
    en: 'Search connectors...',
    cn: '搜索连接器...'
  },
  'connector.wizard.name': {
    en: 'Connector Name',
    cn: '连接器名称'
  },
  'connector.wizard.instanceUrl': {
    en: 'Instance URL (optional)',
    cn: '实例 URL（可选）'
  },
  'connector.wizard.next': {
    en: 'Next →',
    cn: '下一步 →'
  },
  'connector.wizard.prev': {
    en: '← Back',
    cn: '← 上一步'
  },
  'connector.wizard.securityNote': {
    en: 'Credentials are transmitted via AWS managed secure gateway',
    cn: '凭证通过 AWS 托管安全网关传输'
  },
  'connector.wizard.securityDetail': {
    en: 'Agent processes never touch your passwords or tokens',
    cn: 'Agent 进程中不会接触到你的密码或 Token'
  },
  'connector.wizard.apiKey': {
    en: 'API Key',
    cn: 'API Key'
  },
  'connector.wizard.authorize': {
    en: 'Authorize',
    cn: '授权连接'
  },
  'connector.wizard.host': {
    en: 'Host',
    cn: 'Host'
  },
  'connector.wizard.username': {
    en: 'Username',
    cn: '用户名'
  },
  'connector.wizard.password': {
    en: 'Password',
    cn: '密码'
  },
  'connector.wizard.iamRoleArn': {
    en: 'IAM Role ARN',
    cn: 'IAM Role ARN'
  },
  'connector.wizard.serviceAccountJson': {
    en: 'Service Account JSON',
    cn: 'Service Account JSON'
  },
  'connector.wizard.createAndTest': {
    en: 'Create & Test',
    cn: '创建并测试'
  },
  'connector.wizard.creating': {
    en: 'Creating...',
    cn: '创建中...'
  },
  'connector.wizard.success': {
    en: 'Connection successful',
    cn: '连接成功'
  },
  'connector.wizard.done': {
    en: 'Done ✓',
    cn: '完成 ✓'
  },
  'connector.wizard.cancel': {
    en: 'Cancel',
    cn: '取消'
  },
  'connector.status.connected': {
    en: 'Healthy',
    cn: '正常'
  },
  'connector.status.error': {
    en: 'Error',
    cn: '错误'
  },
  'connector.status.disabled': {
    en: 'Disabled',
    cn: '已禁用'
  },
  'connector.status.pending': {
    en: 'Pending',
    cn: '待连接'
  },
  'connector.footer': {
    en: 'Data connectors are securely routed via AgentCore Gateway. Zero credential exposure in agent processes.',
    cn: '数据连接器通过 AgentCore Gateway 安全路由，Agent 进程中零凭证暴露。'
  },
  'connector.uses': {
    en: 'uses',
    cn: '次'
  },
  'connector.items': {
    en: 'items',
    cn: '个'
  },

  // Appearance Settings
  'appearance.title': {
    en: 'Appearance',
    cn: '外观'
  },
  'appearance.subtitle': {
    en: 'Choose how the platform looks to you.',
    cn: '选择平台的显示方式。'
  },
  'appearance.light': {
    en: 'Light',
    cn: '浅色'
  },
  'appearance.lightDesc': {
    en: 'Always use light theme',
    cn: '始终使用浅色主题'
  },
  'appearance.dark': {
    en: 'Dark',
    cn: '深色'
  },
  'appearance.darkDesc': {
    en: 'Always use dark theme',
    cn: '始终使用深色主题'
  },
  'appearance.system': {
    en: 'System',
    cn: '跟随系统'
  },
  'appearance.systemDesc': {
    en: 'Follow your OS setting',
    cn: '跟随操作系统设置'
  },

  // Settings Page
  'settings.title': {
    en: 'Settings',
    cn: '设置'
  },
  'settings.subtitle': {
    en: 'Manage your organization, members, and API access.',
    cn: '管理您的组织、成员和 API 访问。'
  },
  'settings.readOnly': {
    en: 'You have read-only access. Contact an admin to make changes.',
    cn: '您只有只读权限，请联系管理员进行更改。'
  },
  'settings.tab.members': {
    en: 'Members',
    cn: '成员'
  },
  'settings.tab.groups': {
    en: 'Groups',
    cn: '分组'
  },
  'settings.tab.tokenUsage': {
    en: 'Token Usage',
    cn: 'Token 用量'
  },
  'settings.tab.organization': {
    en: 'Organization',
    cn: '组织'
  },
  'settings.tab.apiKeys': {
    en: 'API Keys',
    cn: 'API 密钥'
  },
  'settings.tab.appearance': {
    en: 'Appearance',
    cn: '外观'
  },

  // Organization Tab
  'org.name': {
    en: 'Organization Name',
    cn: '组织名称'
  },
  'org.slug': {
    en: 'Slug',
    cn: '标识符'
  },
  'org.slugPrefix': {
    en: 'org/',
    cn: 'org/'
  },
  'org.slugHint': {
    en: 'Used in URLs. Lowercase letters, numbers, and hyphens only.',
    cn: '用于 URL，仅支持小写字母、数字和连字符。'
  },
  'org.plan': {
    en: 'Plan',
    cn: '套餐'
  },
  'org.saved': {
    en: 'Saved',
    cn: '已保存'
  },
  'org.saveChanges': {
    en: 'Save Changes',
    cn: '保存更改'
  },
  'org.ownerOnly': {
    en: 'Only the organization owner can edit these settings.',
    cn: '仅组织所有者可以编辑这些设置。'
  },

  // Members Tab
  'members.createUser': {
    en: 'Create User',
    cn: '创建用户'
  },
  'members.inviteByEmail': {
    en: 'Invite by Email',
    cn: '邮件邀请'
  },
  'members.createWithCredentials': {
    en: 'Create user with credentials',
    cn: '使用凭证创建用户'
  },
  'members.usernameEmail': {
    en: 'Username (email)',
    cn: '用户名（邮箱）'
  },
  'members.fullName': {
    en: 'Full Name',
    cn: '全名'
  },
  'members.password': {
    en: 'Password',
    cn: '密码'
  },
  'members.role': {
    en: 'Role',
    cn: '角色'
  },
  'members.inviteByEmailTitle': {
    en: 'Invite by email',
    cn: '通过邮件邀请'
  },
  'members.sendInvite': {
    en: 'Send Invite',
    cn: '发送邀请'
  },
  'members.userCreated': {
    en: 'User created successfully',
    cn: '用户创建成功'
  },
  'members.credentialsHint': {
    en: "Share these credentials with the user. The password won't be shown again.",
    cn: '请将凭证分享给用户，密码不会再次显示。'
  },
  'members.username': {
    en: 'Username',
    cn: '用户名'
  },
  'members.dismiss': {
    en: 'Dismiss',
    cn: '关闭'
  },
  'members.colMember': {
    en: 'Member',
    cn: '成员'
  },
  'members.colRole': {
    en: 'Role',
    cn: '角色'
  },
  'members.colStatus': {
    en: 'Status',
    cn: '状态'
  },
  'members.you': {
    en: '(you)',
    cn: '（你）'
  },
  'members.pending': {
    en: 'Pending',
    cn: '待确认'
  },
  'members.active': {
    en: 'Active',
    cn: '活跃'
  },
  'members.removeMember': {
    en: 'Remove member',
    cn: '移除成员'
  },
  'members.confirmRemove': {
    en: 'Remove {name} from the organization?',
    cn: '确定将 {name} 从组织中移除？'
  },
  'members.noMembers': {
    en: 'No members yet.',
    cn: '暂无成员。'
  },

  // Groups Tab
  'groups.createGroup': {
    en: 'Create Group',
    cn: '创建分组'
  },
  'groups.namePlaceholder': {
    en: 'Group name (e.g. Sales Team)',
    cn: '分组名称（如：销售团队）'
  },
  'groups.descPlaceholder': {
    en: 'Description (optional)',
    cn: '描述（可选）'
  },
  'groups.empty': {
    en: 'No groups yet. Create one to start managing access to skills and MCP servers.',
    cn: '暂无分组。创建一个分组来管理技能和 MCP 服务器的访问权限。'
  },
  'groups.members': {
    en: 'members',
    cn: '名成员'
  },
  'groups.addMember': {
    en: 'Add member',
    cn: '添加成员'
  },
  'groups.selectMember': {
    en: 'Select a member...',
    cn: '选择成员...'
  },
  'groups.add': {
    en: 'Add',
    cn: '添加'
  },
  'groups.confirmDelete': {
    en: 'Delete group "{name}"? Members will lose access to skills/MCP servers granted through this group.',
    cn: '删除分组「{name}」？成员将失去通过此分组获得的技能/MCP 服务器访问权限。'
  },

  // API Keys Tab
  'apiKeys.createApiKey': {
    en: 'Create API Key',
    cn: '创建 API 密钥'
  },
  'apiKeys.newApiKey': {
    en: 'New API Key',
    cn: '新建 API 密钥'
  },
  'apiKeys.keyName': {
    en: 'Name',
    cn: '名称'
  },
  'apiKeys.keyNamePlaceholder': {
    en: 'Production Key',
    cn: '生产环境密钥'
  },
  'apiKeys.scopes': {
    en: 'Scopes',
    cn: '权限范围'
  },
  'apiKeys.scopeWorkflowExecute': {
    en: 'Execute Workflows',
    cn: '执行工作流'
  },
  'apiKeys.scopeWorkflowRead': {
    en: 'Read Workflows',
    cn: '读取工作流'
  },
  'apiKeys.scopeWorkflowWrite': {
    en: 'Write Workflows',
    cn: '写入工作流'
  },
  'apiKeys.scopeModelInvoke': {
    en: 'Invoke LLM Models',
    cn: '调用 LLM 模型'
  },
  'apiKeys.rateLimit': {
    en: 'Rate limit / min',
    cn: '速率限制 / 分钟'
  },
  'apiKeys.expires': {
    en: 'Expires',
    cn: '过期时间'
  },
  'apiKeys.expiresNever': {
    en: 'Never',
    cn: '永不过期'
  },
  'apiKeys.expires30': {
    en: '30 days',
    cn: '30 天'
  },
  'apiKeys.expires90': {
    en: '90 days',
    cn: '90 天'
  },
  'apiKeys.expires1y': {
    en: '1 year',
    cn: '1 年'
  },
  'apiKeys.created': {
    en: 'API Key Created',
    cn: 'API 密钥已创建'
  },
  'apiKeys.copyHint': {
    en: "Copy it now — it won't be shown again.",
    cn: '请立即复制，密钥不会再次显示。'
  },
  'apiKeys.keySaved': {
    en: "I've saved the key",
    cn: '我已保存密钥'
  },
  'apiKeys.copied': {
    en: 'Copied',
    cn: '已复制'
  },
  'apiKeys.copy': {
    en: 'Copy',
    cn: '复制'
  },
  'apiKeys.availableModels': {
    en: 'Available Models',
    cn: '可用模型'
  },
  'apiKeys.noKeys': {
    en: 'No API keys yet.',
    cn: '暂无 API 密钥。'
  },
  'apiKeys.statusRevoked': {
    en: 'Revoked',
    cn: '已撤销'
  },
  'apiKeys.statusExpired': {
    en: 'Expired',
    cn: '已过期'
  },
  'apiKeys.statusActive': {
    en: 'Active',
    cn: '活跃'
  },
  'apiKeys.neverUsed': {
    en: 'Never used',
    cn: '从未使用'
  },
  'apiKeys.justNow': {
    en: 'Just now',
    cn: '刚刚'
  },
  'apiKeys.mAgo': {
    en: '{n}m ago',
    cn: '{n}分钟前'
  },
  'apiKeys.hAgo': {
    en: '{n}h ago',
    cn: '{n}小时前'
  },
  'apiKeys.confirmRevoke': {
    en: 'Revoke "{name}"? This will immediately disable the key.',
    cn: '撤销「{name}」？密钥将立即失效。'
  },
  'apiKeys.confirmDelete': {
    en: 'Permanently delete "{name}"?',
    cn: '永久删除「{name}」？'
  },

  // Token Usage Tab
  'tokenUsage.myUsage': {
    en: 'My Token Usage',
    cn: '我的 Token 用量'
  },
  'tokenUsage.inputTokens': {
    en: 'Input Tokens',
    cn: '输入 Token'
  },
  'tokenUsage.outputTokens': {
    en: 'Output Tokens',
    cn: '输出 Token'
  },
  'tokenUsage.totalTokens': {
    en: 'Total Tokens',
    cn: '总 Token'
  },
  'tokenUsage.estCost': {
    en: 'Est. Cost',
    cn: '预估费用'
  },
  'tokenUsage.noUsage': {
    en: 'No usage this month.',
    cn: '本月暂无用量。'
  },
  'tokenUsage.monthlyHistory': {
    en: 'Monthly History',
    cn: '月度历史'
  },
  'tokenUsage.orgUsage': {
    en: 'Organization Token Usage',
    cn: '组织 Token 用量'
  },
  'tokenUsage.noData': {
    en: 'No usage data yet.',
    cn: '暂无用量数据。'
  },
  'tokenUsage.colUser': {
    en: 'User',
    cn: '用户'
  },
  'tokenUsage.colInput': {
    en: 'Input',
    cn: '输入'
  },
  'tokenUsage.colOutput': {
    en: 'Output',
    cn: '输出'
  },
  'tokenUsage.colTotal': {
    en: 'Total',
    cn: '总计'
  },
  'tokenUsage.colCost': {
    en: 'Cost',
    cn: '费用'
  },
  'tokenUsage.colCalls': {
    en: 'Calls',
    cn: '调用次数'
  },

  // Error Boundary
  'error.title': {
    en: 'Something went wrong',
    cn: '出错了'
  },
  'error.description': {
    en: 'An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.',
    cn: '发生了意外错误，请尝试刷新页面，如果问题持续存在请联系支持。'
  },
  'error.details': {
    en: 'Error Details (Development)',
    cn: '错误详情（开发环境）'
  },
  'error.tryAgain': {
    en: 'Try Again',
    cn: '重试'
  },

  // Message List
  'chat.emptyState': {
    en: 'Start a conversation by sending a message',
    cn: '发送消息开始对话'
  },

  // Context Panel
  'chat.noContext': {
    en: 'No context available',
    cn: '暂无上下文'
  },

  // Canvas Nodes
  'node.inputVariables': {
    en: 'Input Variables',
    cn: '输入变量'
  },
  'node.noInputVariables': {
    en: 'No input variables',
    cn: '无输入变量'
  },
  'node.nMore': {
    en: '+{n} more',
    cn: '还有 {n} 项'
  },
  'node.outputMapping': {
    en: 'Output Mapping',
    cn: '输出映射'
  },
  'node.shared': {
    en: 'Shared',
    cn: '已共享'
  },
  'node.conditions': {
    en: 'Conditions',
    cn: '条件'
  },
  'node.branchYes': {
    en: 'Yes',
    cn: '是'
  },
  'node.branchNo': {
    en: 'No',
    cn: '否'
  },
  'node.actionApiCall': {
    en: 'API Call',
    cn: 'API 调用'
  },
  'node.actionDatabase': {
    en: 'Database',
    cn: '数据库'
  },
  'node.actionNotification': {
    en: 'Notification',
    cn: '通知'
  },
  'node.actionTransform': {
    en: 'Transform',
    cn: '转换'
  },
  'node.actionCustom': {
    en: 'Custom',
    cn: '自定义'
  },
  'node.approvalPending': {
    en: 'Pending',
    cn: '待审批'
  },
  'node.approvalApproved': {
    en: 'Approved',
    cn: '已通过'
  },
  'node.approvalRejected': {
    en: 'Rejected',
    cn: '已拒绝'
  },
  'node.approvalTimeout': {
    en: 'Timeout',
    cn: '已超时'
  },
  'node.approver': {
    en: 'Approver:',
    cn: '审批人：'
  },
  'node.timeout': {
    en: 'Timeout: {n}s',
    cn: '超时：{n}秒'
  },
  'node.code': {
    en: 'Code',
    cn: '代码'
  },
  'node.preview': {
    en: 'Preview',
    cn: '预览'
  },
  'node.noCodeYet': {
    en: '// No code yet',
    cn: '// 暂无代码'
  },
  'node.previewAvailable': {
    en: 'Preview available',
    cn: '可预览'
  },
  'node.noPreview': {
    en: 'No preview',
    cn: '无预览'
  },

  // Canvas Toolbar
  'canvas.addNode': {
    en: 'Add Node',
    cn: '添加节点'
  },
  'canvas.nodeAgent': {
    en: 'Agent',
    cn: '智能体'
  },
  'canvas.nodeAgentDesc': {
    en: 'AI agent that executes tasks',
    cn: '执行任务的 AI 智能体'
  },
  'canvas.nodeStart': {
    en: 'Start',
    cn: '开始'
  },
  'canvas.nodeStartDesc': {
    en: 'Workflow entry point',
    cn: '工作流入口'
  },
  'canvas.nodeAction': {
    en: 'Action',
    cn: '动作'
  },
  'canvas.nodeActionDesc': {
    en: 'Execute an action',
    cn: '执行一个动作'
  },
  'canvas.nodeCondition': {
    en: 'Condition',
    cn: '条件'
  },
  'canvas.nodeConditionDesc': {
    en: 'Conditional branching',
    cn: '条件分支'
  },
  'canvas.nodeDocument': {
    en: 'Document',
    cn: '文档'
  },
  'canvas.nodeDocumentDesc': {
    en: 'Rich text document',
    cn: '富文本文档'
  },
  'canvas.nodeCode': {
    en: 'Code',
    cn: '代码'
  },
  'canvas.nodeCodeDesc': {
    en: 'Code artifact',
    cn: '代码产物'
  },
  'canvas.nodeEnd': {
    en: 'End',
    cn: '结束'
  },
  'canvas.nodeEndDesc': {
    en: 'Workflow end point',
    cn: '工作流终点'
  },

  // Variables Panel
  'variables.title': {
    en: 'Workflow Variables',
    cn: '工作流变量'
  },
  'variables.empty': {
    en: 'No variables defined',
    cn: '未定义变量'
  },
  'variables.emptyHint': {
    en: 'Variables allow users to provide input when running the workflow',
    cn: '变量允许用户在运行工作流时提供输入'
  },
  'variables.add': {
    en: 'Add Variable',
    cn: '添加变量'
  },
  'variables.name': {
    en: 'Name',
    cn: '名称'
  },
  'variables.type': {
    en: 'Type',
    cn: '类型'
  },
  'variables.typeText': {
    en: 'Text',
    cn: '文本'
  },
  'variables.typeFile': {
    en: 'File/Resource',
    cn: '文件/资源'
  },
  'variables.description': {
    en: 'Description',
    cn: '描述'
  },
  'variables.descPlaceholder': {
    en: 'Describe what this variable is for...',
    cn: '描述此变量的用途...'
  },
  'variables.required': {
    en: 'Required',
    cn: '必填'
  },
  'variables.defaultValues': {
    en: 'Default Value(s)',
    cn: '默认值'
  },
  'variables.addDefault': {
    en: '+ Add',
    cn: '+ 添加'
  },
  'variables.noDefault': {
    en: 'No default value',
    cn: '无默认值'
  },
  'variables.defaultPlaceholder': {
    en: 'Default value...',
    cn: '默认值...'
  },
  'variables.referenceHint': {
    en: 'Reference in prompts:',
    cn: '在提示词中引用：'
  },

  // Node Editor Panel
  'editor.selectNode': {
    en: 'Select a node to edit',
    cn: '选择一个节点进行编辑'
  },
  'editor.title': {
    en: 'Title',
    cn: '标题'
  },
  'editor.delete': {
    en: 'Delete',
    cn: '删除'
  },
  'editor.confirmDelete': {
    en: 'Are you sure you want to delete this node?',
    cn: '确定要删除此节点吗？'
  },
  'editor.autoSaveHint': {
    en: 'Changes are auto-saved. Click the main Save button to persist to database.',
    cn: '更改已自动保存。点击主保存按钮以持久化到数据库。'
  },
  'editor.selectAgent': {
    en: 'Select Agent',
    cn: '选择智能体'
  },
  'editor.chooseAgent': {
    en: 'Choose an agent...',
    cn: '选择一个智能体...'
  },
  'editor.queryPrompt': {
    en: 'Query / Prompt',
    cn: '查询 / 提示词'
  },
  'editor.queryPlaceholder': {
    en: 'Enter the task or question for this agent...',
    cn: '输入此智能体的任务或问题...'
  },
  'editor.variableRefHint': {
    en: 'Use {{variableName}} to reference workflow variables',
    cn: '使用 {{variableName}} 引用工作流变量'
  },
  'editor.inputVariables': {
    en: 'Input Variables',
    cn: '输入变量'
  },
  'editor.addVariable': {
    en: 'Add',
    cn: '添加'
  },
  'editor.variableName': {
    en: 'Variable name',
    cn: '变量名'
  },
  'editor.typeText': {
    en: 'Text',
    cn: '文本'
  },
  'editor.typeOption': {
    en: 'Option',
    cn: '选项'
  },
  'editor.typeResource': {
    en: 'Resource',
    cn: '资源'
  },
  'editor.required': {
    en: 'Required',
    cn: '必填'
  },
  'editor.noVariables': {
    en: 'No input variables defined',
    cn: '未定义输入变量'
  },
  'editor.actionLabel': {
    en: 'What should this action do?',
    cn: '此动作应该做什么？'
  },
  'editor.actionHint': {
    en: 'Claude will use available API skills to execute this action during workflow run.',
    cn: 'Claude 将在工作流运行期间使用可用的 API 技能来执行此动作。'
  },
  'editor.conditionLabel': {
    en: 'Condition',
    cn: '条件'
  },
  'editor.conditionHint': {
    en: 'Claude will evaluate this condition naturally during execution.',
    cn: 'Claude 将在执行期间自然地评估此条件。'
  },

  // Node type labels (for editor panel header)
  'nodeType.agent': {
    en: 'Agent',
    cn: '智能体'
  },
  'nodeType.start': {
    en: 'Start',
    cn: '开始'
  },
  'nodeType.end': {
    en: 'End',
    cn: '结束'
  },
  'nodeType.humanApproval': {
    en: 'Approval (legacy)',
    cn: '审批（旧版）'
  },
  'nodeType.action': {
    en: 'Action',
    cn: '动作'
  },
  'nodeType.condition': {
    en: 'Condition',
    cn: '条件'
  },
  'nodeType.document': {
    en: 'Document',
    cn: '文档'
  },
  'nodeType.codeArtifact': {
    en: 'Code',
    cn: '代码'
  },
  'nodeType.resource': {
    en: 'Resource',
    cn: '资源'
  },
  'nodeType.trigger': {
    en: 'Trigger',
    cn: '触发器'
  },
  'nodeType.loop': {
    en: 'Loop',
    cn: '循环'
  },
  'nodeType.parallel': {
    en: 'Parallel',
    cn: '并行'
  },
  'nodeType.group': {
    en: 'Group',
    cn: '分组'
  },
  'nodeType.memo': {
    en: 'Note',
    cn: '备注'
  },

  // Run Workflow Modal
  'runWorkflow.title': {
    en: 'Run Workflow',
    cn: '运行工作流'
  },
  'runWorkflow.noVariables': {
    en: 'This workflow has no input variables. Click Run to start.',
    cn: '此工作流没有输入变量，点击运行即可开始。'
  },
  'runWorkflow.fillVariables': {
    en: 'Fill in the input variables for this workflow run.',
    cn: '填写此次工作流运行的输入变量。'
  },
  'runWorkflow.requiredMissing': {
    en: 'Required fields missing: {fields}',
    cn: '缺少必填字段：{fields}'
  },
  'runWorkflow.run': {
    en: 'Run',
    cn: '运行'
  },

  // Execution Detail Modal
  'execution.title': {
    en: 'Execution Detail',
    cn: '执行详情'
  },
  'execution.duration': {
    en: 'Duration: {n}s',
    cn: '耗时：{n}秒'
  },
  'execution.loading': {
    en: 'Loading execution details...',
    cn: '加载执行详情...'
  },
  'execution.completed': {
    en: '{n} completed',
    cn: '{n} 已完成'
  },
  'execution.failed': {
    en: '{n} failed',
    cn: '{n} 失败'
  },
  'execution.totalNodes': {
    en: '{n} total nodes',
    cn: '共 {n} 个节点'
  },
  'execution.error': {
    en: 'Execution Error',
    cn: '执行错误'
  },
  'execution.inputVariables': {
    en: 'Input Variables',
    cn: '输入变量'
  },
  'execution.nodeLog': {
    en: 'Node Execution Log',
    cn: '节点执行日志'
  },
  'execution.logs': {
    en: 'Logs',
    cn: '日志'
  },
  'execution.workspace': {
    en: 'Workspace',
    cn: '工作区'
  },
  'execution.output': {
    en: 'Output',
    cn: '输出'
  },

  // Create Room Dialog
  'room.createTitle': {
    en: 'Create Group Chat Room',
    cn: '创建群聊房间'
  },
  'room.fromScope': {
    en: 'From Business Scope',
    cn: '从业务范围导入'
  },
  'room.fromScopeDesc': {
    en: 'Import all agents from a scope',
    cn: '导入业务范围内的所有智能体'
  },
  'room.manual': {
    en: 'Manual Selection',
    cn: '手动选择'
  },
  'room.manualDesc': {
    en: 'Pick agents from your roster',
    cn: '从列表中选择智能体'
  },
  'room.selectScope': {
    en: 'Select Business Scope',
    cn: '选择业务范围'
  },
  'room.chooseScope': {
    en: 'Choose a scope...',
    cn: '选择一个业务范围...'
  },
  'room.titleLabel': {
    en: 'Room Title (optional)',
    cn: '房间标题（可选）'
  },
  'room.routingStrategy': {
    en: 'Routing Strategy',
    cn: '路由策略'
  },
  'room.routingAuto': {
    en: 'Auto (AI decides who responds)',
    cn: '自动（AI 决定谁回复）'
  },
  'room.routingMention': {
    en: 'Mention only (@agent to trigger)',
    cn: '仅提及（@智能体 触发）'
  },
  'room.selectAgents': {
    en: 'Select Agents ({n} selected)',
    cn: '选择智能体（已选 {n} 个）'
  },
  'room.back': {
    en: 'Back',
    cn: '返回'
  },
  'room.creating': {
    en: 'Creating...',
    cn: '创建中...'
  },
  'room.createRoom': {
    en: 'Create Room',
    cn: '创建房间'
  },

  // Group Access Popover
  'groupAccess.access': {
    en: 'Access',
    cn: '访问权限'
  },
  'groupAccess.accessFor': {
    en: 'Access: {name}',
    cn: '访问权限：{name}'
  },
  'groupAccess.noGroups': {
    en: 'No groups yet. Create groups in Settings → Groups.',
    cn: '暂无分组。请在设置 → 分组中创建。'
  },

  // Scope Access Panel
  'scopeAccess.title': {
    en: 'Access Control',
    cn: '访问控制'
  },
  'scopeAccess.openScope': {
    en: 'Open Scope',
    cn: '开放范围'
  },
  'scopeAccess.restrictedScope': {
    en: 'Restricted Scope',
    cn: '受限范围'
  },
  'scopeAccess.openDesc': {
    en: 'All organization members can access this scope',
    cn: '所有组织成员均可访问此范围'
  },
  'scopeAccess.restrictedDesc': {
    en: 'Only explicitly added members can access this scope',
    cn: '仅明确添加的成员可访问此范围'
  },
  'scopeAccess.restrict': {
    en: 'Restrict',
    cn: '限制'
  },
  'scopeAccess.open': {
    en: 'Open',
    cn: '开放'
  },
  'scopeAccess.addMember': {
    en: 'Add Member',
    cn: '添加成员'
  },
  'scopeAccess.selectMember': {
    en: 'Select a member...',
    cn: '选择成员...'
  },
  'scopeAccess.colMember': {
    en: 'Member',
    cn: '成员'
  },
  'scopeAccess.colScopeRole': {
    en: 'Scope Role',
    cn: '范围角色'
  },
  'scopeAccess.removeFromScope': {
    en: 'Remove from scope',
    cn: '从范围中移除'
  },
  'scopeAccess.emptyOpen': {
    en: 'No explicit members. All org members have access.',
    cn: '无明确成员。所有组织成员均可访问。'
  },
  'scopeAccess.emptyRestricted': {
    en: 'No members added yet. Add members to grant access.',
    cn: '尚未添加成员。添加成员以授予访问权限。'
  },

  // Scope Memory Panel
  'scopeMemory.title': {
    en: 'Scope Memory',
    cn: '范围记忆'
  },
  'scopeMemory.entries': {
    en: 'entries',
    cn: '条'
  },
  'scopeMemory.addMemory': {
    en: 'Add Memory',
    cn: '添加记忆'
  },
  'scopeMemory.searchPlaceholder': {
    en: 'Search memories...',
    cn: '搜索记忆...'
  },
  'scopeMemory.allCategories': {
    en: 'All categories',
    cn: '所有分类'
  },
  'scopeMemory.titlePlaceholder': {
    en: 'Memory title',
    cn: '记忆标题'
  },
  'scopeMemory.contentPlaceholder': {
    en: 'What should this scope remember?',
    cn: '此范围应该记住什么？'
  },
  'scopeMemory.tagsPlaceholder': {
    en: 'Tags (comma-separated)',
    cn: '标签（逗号分隔）'
  },
  'scopeMemory.pin': {
    en: 'Pin',
    cn: '置顶'
  },
  'scopeMemory.saveMemory': {
    en: 'Save Memory',
    cn: '保存记忆'
  },
  'scopeMemory.loading': {
    en: 'Loading memories...',
    cn: '加载记忆中...'
  },
  'scopeMemory.empty': {
    en: 'No memories yet',
    cn: '暂无记忆'
  },
  'scopeMemory.emptyHint': {
    en: 'Add knowledge that {name} should remember across sessions.',
    cn: '添加 {name} 应在会话间记住的知识。'
  },

  // Agent List
  'agentList.searchPlaceholder': {
    en: 'Search agents...',
    cn: '搜索智能体...'
  },
  'agentList.independent': {
    en: 'Independent Agents',
    cn: '独立智能体'
  },
  'agentList.digitalTwin': {
    en: 'Digital Twin',
    cn: '数字分身'
  },
  'agentList.viewScope': {
    en: 'View',
    cn: '查看'
  },
  'agentList.digitalTwins': {
    en: 'Digital Twins',
    cn: '数字分身'
  },

  // Business Scope Dropdown
  'scopeDropdown.searchPlaceholder': {
    en: 'Search scopes...',
    cn: '搜索业务范围...'
  },
  'scopeDropdown.noResults': {
    en: 'No scopes found',
    cn: '未找到业务范围'
  },

  // Capability Card
  'capability.toolId': {
    en: 'Tool ID',
    cn: '工具 ID'
  },

  // Sidebar
  'sidebar.adminMenu': {
    en: 'Admin Menu',
    cn: '管理菜单'
  },

  // App (REST API placeholder)
  'config.restApi': {
    en: 'REST API Configuration',
    cn: 'REST API 配置'
  },

  // Login Page
  'login.title': {
    en: 'Super Agent Platform',
    cn: 'Super Agent 平台'
  },
  'login.ssoSubtitle': {
    en: 'Sign in with your organization account',
    cn: '使用组织账号登录'
  },
  'login.registerSubtitle': {
    en: 'Create your account',
    cn: '创建您的账号'
  },
  'login.signInSubtitle': {
    en: 'Sign in to continue',
    cn: '登录以继续'
  },
  'login.ssoButton': {
    en: 'Sign In with SSO',
    cn: '通过 SSO 登录'
  },
  'login.ssoPoweredBy': {
    en: 'Powered by Amazon Cognito',
    cn: '由 Amazon Cognito 提供支持'
  },
  'login.fullName': {
    en: 'Full Name',
    cn: '全名'
  },
  'login.fullNamePlaceholder': {
    en: 'Your name',
    cn: '您的姓名'
  },
  'login.username': {
    en: 'Username',
    cn: '用户名'
  },
  'login.usernamePlaceholder': {
    en: 'Enter username',
    cn: '输入用户名'
  },
  'login.password': {
    en: 'Password',
    cn: '密码'
  },
  'login.passwordPlaceholder': {
    en: 'Enter password',
    cn: '输入密码'
  },
  'login.submitting': {
    en: 'Please wait...',
    cn: '请稍候...'
  },
  'login.createAccount': {
    en: 'Create Account',
    cn: '创建账号'
  },
  'login.signIn': {
    en: 'Sign In',
    cn: '登录'
  },
  'login.hasAccount': {
    en: 'Already have an account?',
    cn: '已有账号？'
  },
  'login.noAccount': {
    en: "Don't have an account?",
    cn: '没有账号？'
  },
  'login.register': {
    en: 'Register',
    cn: '注册'
  },

  // Invite Accept Page
  'invite.validating': {
    en: 'Validating invite...',
    cn: '验证邀请中...'
  },
  'invite.invalidTitle': {
    en: 'Invalid Invitation',
    cn: '无效邀请'
  },
  'invite.invalidDesc': {
    en: 'This invite link is invalid or has expired.',
    cn: '此邀请链接无效或已过期。'
  },
  'invite.goToLogin': {
    en: 'Go to login',
    cn: '前往登录'
  },
  'invite.joinOrg': {
    en: 'Join {name}',
    cn: '加入 {name}'
  },
  'invite.invitedAs': {
    en: "You've been invited as",
    cn: '您被邀请为'
  },
  'invite.email': {
    en: 'Email',
    cn: '邮箱'
  },
  'invite.fullName': {
    en: 'Full Name',
    cn: '全名'
  },
  'invite.fullNamePlaceholder': {
    en: 'Your name',
    cn: '您的姓名'
  },
  'invite.password': {
    en: 'Password',
    cn: '密码'
  },
  'invite.passwordPlaceholder': {
    en: 'At least 8 characters',
    cn: '至少 8 个字符'
  },
  'invite.confirmPassword': {
    en: 'Confirm Password',
    cn: '确认密码'
  },
  'invite.confirmPlaceholder': {
    en: 'Confirm your password',
    cn: '确认您的密码'
  },
  'invite.submitting': {
    en: 'Creating account...',
    cn: '创建账号中...'
  },
  'invite.accept': {
    en: 'Accept & Create Account',
    cn: '接受并创建账号'
  },
  'invite.passwordMismatch': {
    en: 'Passwords do not match',
    cn: '两次输入的密码不一致'
  },
  'invite.invalidLink': {
    en: 'Invalid invite link',
    cn: '无效的邀请链接'
  },
  'invite.acceptFailed': {
    en: 'Failed to accept invitation',
    cn: '接受邀请失败'
  },

  // Workflow Copilot
  'copilot.emptyHasNodes': {
    en: 'Ask anything about this workflow',
    cn: '关于此工作流，你可以问任何问题'
  },
  'copilot.emptyNoNodes': {
    en: 'Describe the workflow you want to create',
    cn: '描述你想创建的工作流'
  },
  'copilot.emptyHint': {
    en: 'Generate, modify, or run workflows from here',
    cn: '在这里生成、修改或运行工作流'
  },
  'copilot.placeholder': {
    en: 'Generate, modify, or ask about this workflow...',
    cn: '生成、修改或询问此工作流...'
  },
  'copilot.enterToSend': {
    en: 'Enter to send',
    cn: '回车发送'
  },
  'copilot.executionError': {
    en: 'Execution error',
    cn: '执行错误'
  },
  'copilot.workflowCompleted': {
    en: 'Workflow completed. {completed}/{total} steps finished{failed}.',
    cn: '工作流完成。{completed}/{total} 步已完成{failed}。'
  },
  'copilot.workflowFailed': {
    en: 'Workflow execution failed.',
    cn: '工作流执行失败。'
  },
  'copilot.error': {
    en: 'An error occurred.',
    cn: '发生错误。'
  },

  // Document Groups Panel
  'docGroups.title': {
    en: 'Knowledge Base',
    cn: '知识库'
  },
  'docGroups.newGroup': {
    en: 'New Group',
    cn: '新建分组'
  },
  'docGroups.assign': {
    en: 'Assign',
    cn: '关联'
  },
  'docGroups.namePlaceholder': {
    en: 'Group name',
    cn: '分组名称'
  },
  'docGroups.descPlaceholder': {
    en: 'Description (optional)',
    cn: '描述（可选）'
  },
  'docGroups.createAndAssign': {
    en: 'Create & Assign',
    cn: '创建并关联'
  },
  'docGroups.noUnassigned': {
    en: 'No unassigned groups available.',
    cn: '没有可关联的分组。'
  },
  'docGroups.files': {
    en: 'files',
    cn: '个文件'
  },
  'docGroups.empty': {
    en: 'No document groups assigned',
    cn: '未关联文档分组'
  },
  'docGroups.removeFromScope': {
    en: 'Remove from scope',
    cn: '从范围中移除'
  },
  'docGroups.uploading': {
    en: 'Uploading...',
    cn: '上传中...'
  },
  'docGroups.uploadFiles': {
    en: 'Upload files',
    cn: '上传文件'
  },
  'docGroups.noFiles': {
    en: 'No files yet',
    cn: '暂无文件'
  },

  // Rehearsal Panel
  'rehearsal.title': {
    en: 'Agent Evolution',
    cn: '智能体进化'
  },
  'rehearsal.pending': {
    en: '{n} pending',
    cn: '{n} 待处理'
  },
  'rehearsal.run': {
    en: 'Run Rehearsal',
    cn: '运行演练'
  },
  'rehearsal.tabRehearsals': {
    en: 'Rehearsals',
    cn: '演练'
  },
  'rehearsal.tabProposals': {
    en: 'Proposals',
    cn: '提案'
  },
  'rehearsal.manual': {
    en: 'Manual',
    cn: '手动'
  },
  'rehearsal.auto': {
    en: 'Auto',
    cn: '自动'
  },
  'rehearsal.rehearsal': {
    en: 'rehearsal',
    cn: '演练'
  },
  'rehearsal.emptyRehearsals': {
    en: 'No rehearsals yet',
    cn: '暂无演练'
  },
  'rehearsal.emptyRehearsalsHint': {
    en: 'Click "Run Rehearsal" to evaluate {name}\'s agents.',
    cn: '点击"运行演练"来评估 {name} 的智能体。'
  },
  'rehearsal.emptyProposals': {
    en: 'No proposals yet',
    cn: '暂无提案'
  },
  'rehearsal.emptyProposalsHint': {
    en: 'Proposals are generated after rehearsals find improvement opportunities.',
    cn: '演练发现改进机会后会自动生成提案。'
  },
  'rehearsal.applyChanges': {
    en: 'Apply Changes',
    cn: '应用更改'
  },
  'rehearsal.reject': {
    en: 'Reject',
    cn: '拒绝'
  },
  'rehearsal.applied': {
    en: 'Applied',
    cn: '已应用'
  },
  'rehearsal.rejected': {
    en: 'Rejected',
    cn: '已拒绝'
  },
  'rehearsal.promptTuning': {
    en: 'Prompt Tuning',
    cn: '提示词调优'
  },
  'rehearsal.newSkill': {
    en: 'New Skill',
    cn: '新技能'
  },
  'rehearsal.toolConfig': {
    en: 'Tool Config',
    cn: '工具配置'
  },
  'rehearsal.newAgent': {
    en: 'New Agent',
    cn: '新智能体'
  },

  // Chat Room
  'chatRoom.groupChat': {
    en: 'Group Chat',
    cn: '群聊'
  },
  'chatRoom.members': {
    en: '{n} members',
    cn: '{n} 名成员'
  },
  'chatRoom.add': {
    en: 'Add',
    cn: '添加'
  },
  'chatRoom.empty': {
    en: 'No messages yet. Start the conversation!',
    cn: '暂无消息，开始对话吧！'
  },
  'chatRoom.uncertainPick': {
    en: 'Not sure who should answer — pick one:',
    cn: '不确定谁应该回答——请选择：'
  },
  'chatRoom.dismiss': {
    en: 'Dismiss',
    cn: '忽略'
  },
  'chatRoom.membersPanel': {
    en: 'Members',
    cn: '成员'
  },
  'chatRoom.remove': {
    en: 'Remove',
    cn: '移除'
  },
  'chatRoom.agentPlaceholder': {
    en: 'Describe the agent you need...',
    cn: '描述你需要的智能体...'
  },
  'chatRoom.generate': {
    en: 'Generate',
    cn: '生成'
  },
  'chatRoom.confirmAdd': {
    en: 'Confirm & Add',
    cn: '确认并添加'
  },
  'chatRoom.adjust': {
    en: 'Adjust',
    cn: '调整'
  },
  'chatRoom.placeholder': {
    en: 'Type a message... Use @ to mention an agent',
    cn: '输入消息... 使用 @ 提及智能体'
  },
  'chatRoom.loading': {
    en: 'Loading room...',
    cn: '加载房间中...'
  },
  'chatRoom.loadFailed': {
    en: 'Failed to load room',
    cn: '加载房间失败'
  },

  // Webhook Panel
  'webhook.title': {
    en: 'Webhooks',
    cn: 'Webhooks'
  },
  'webhook.saveSecret': {
    en: "⚠️ Save this secret - it won't be shown again!",
    cn: '⚠️ 请保存此密钥——不会再次显示！'
  },
  'webhook.example': {
    en: 'Example:',
    cn: '示例：'
  },
  'webhook.secretSaved': {
    en: "I've saved it",
    cn: '我已保存'
  },
  'webhook.noWebhooks': {
    en: 'No webhooks configured',
    cn: '未配置 Webhook'
  },
  'webhook.create': {
    en: 'Create Webhook',
    cn: '创建 Webhook'
  },
  'webhook.add': {
    en: 'Add Webhook',
    cn: '添加 Webhook'
  },
  'webhook.active': {
    en: 'Active',
    cn: '活跃'
  },
  'webhook.disabled': {
    en: 'Disabled',
    cn: '已禁用'
  },
  'webhook.history': {
    en: 'History',
    cn: '历史'
  },
  'webhook.confirmDelete': {
    en: 'Are you sure you want to delete this webhook?',
    cn: '确定要删除此 Webhook 吗？'
  },
  'webhook.executionHistory': {
    en: 'Execution History',
    cn: '执行历史'
  },
  'webhook.refresh': {
    en: 'Refresh',
    cn: '刷新'
  },
  'webhook.noCalls': {
    en: 'No calls yet',
    cn: '暂无调用'
  },
  'webhook.duration': {
    en: 'Duration',
    cn: '耗时'
  },
  'webhook.runningFor': {
    en: 'Running for',
    cn: '运行中'
  },
  'webhook.executionLog': {
    en: 'Execution Log',
    cn: '执行日志'
  },
  'webhook.inProgress': {
    en: 'Execution in progress...',
    cn: '执行中...'
  },
  'webhook.noLogs': {
    en: 'No log events recorded',
    cn: '无日志记录'
  },
  'webhook.logsAutoUpdate': {
    en: 'Execution in progress — logs update automatically',
    cn: '执行中——日志自动更新'
  },

  // ApiKeysPanel (component version) — extras beyond settings tab
  'apiKeys.createdSuccess': {
    en: '✓ API Key Created Successfully',
    cn: '✓ API 密钥创建成功'
  },
  'apiKeys.copyNow': {
    en: "Copy this key now - it won't be shown again!",
    cn: '请立即复制此密钥——不会再次显示！'
  },
  'apiKeys.copiedKey': {
    en: "I've copied the key",
    cn: '我已复制密钥'
  },
  'apiKeys.createKey': {
    en: 'Create Key',
    cn: '创建密钥'
  },
  'apiKeys.emptyHint': {
    en: 'Create an API key to access workflows programmatically',
    cn: '创建 API 密钥以编程方式访问工作流'
  },
  'apiKeys.scopeExecuteDesc': {
    en: 'Run workflows via API',
    cn: '通过 API 运行工作流'
  },
  'apiKeys.scopeReadDesc': {
    en: 'View workflow definitions',
    cn: '查看工作流定义'
  },
  'apiKeys.scopeWriteDesc': {
    en: 'Create and modify workflows',
    cn: '创建和修改工作流'
  },
  'apiKeys.rateLimitPerMin': {
    en: 'Rate Limit (per minute)',
    cn: '速率限制（每分钟）'
  },
  'apiKeys.expiresIn': {
    en: 'Expires In',
    cn: '过期时间'
  },
  'apiKeys.expires180': {
    en: '180 days',
    cn: '180 天'
  },
  'apiKeys.apiUsage': {
    en: 'API Usage',
    cn: 'API 用法'
  },
  'apiKeys.minutesAgo': {
    en: '{n} minutes ago',
    cn: '{n} 分钟前'
  },
  'apiKeys.hoursAgo': {
    en: '{n} hours ago',
    cn: '{n} 小时前'
  },

  // Schedule Panel
  'schedule.title': {
    en: 'Schedules',
    cn: '定时任务'
  },
  'schedule.newSchedule': {
    en: 'New Schedule',
    cn: '新建定时任务'
  },
  'schedule.name': {
    en: 'Name',
    cn: '名称'
  },
  'schedule.cronExpression': {
    en: 'Cron Expression',
    cn: 'Cron 表达式'
  },
  'schedule.timezone': {
    en: 'Timezone',
    cn: '时区'
  },
  'schedule.noSchedules': {
    en: 'No schedules configured',
    cn: '未配置定时任务'
  },
  'schedule.create': {
    en: 'Create Schedule',
    cn: '创建定时任务'
  },
  'schedule.addSchedule': {
    en: 'Add Schedule',
    cn: '添加定时任务'
  },
  'schedule.confirmDelete': {
    en: 'Are you sure you want to delete this schedule?',
    cn: '确定要删除此定时任务吗？'
  },
  'schedule.active': {
    en: 'Active',
    cn: '活跃'
  },
  'schedule.disabled': {
    en: 'Disabled',
    cn: '已禁用'
  },
  'schedule.runs': {
    en: '{n} runs',
    cn: '{n} 次运行'
  },
  'schedule.failures': {
    en: '{n} failures',
    cn: '{n} 次失败'
  },
  'schedule.viewHistory': {
    en: 'View History',
    cn: '查看历史'
  },
  'schedule.executionHistory': {
    en: 'Execution History',
    cn: '执行历史'
  },
  'schedule.noExecutions': {
    en: 'No executions yet',
    cn: '暂无执行记录'
  },
  'schedule.notScheduled': {
    en: 'Not scheduled',
    cn: '未调度'
  },
  'schedule.overdue': {
    en: 'Overdue',
    cn: '已过期'
  },
  'schedule.inLessThanMinute': {
    en: 'In less than a minute',
    cn: '不到一分钟后'
  },
  'schedule.inMinutes': {
    en: 'In {n} minutes',
    cn: '{n} 分钟后'
  },
  'schedule.inHours': {
    en: 'In {n} hours',
    cn: '{n} 小时后'
  },
  'schedule.executionLog': {
    en: 'Execution Log',
    cn: '执行日志'
  },
  'schedule.waitingForEvents': {
    en: 'Waiting for events...',
    cn: '等待事件...'
  },
  'schedule.noLogs': {
    en: 'No log events recorded',
    cn: '无日志记录'
  },
  'schedule.logsAutoUpdate': {
    en: 'Execution in progress — logs update automatically',
    cn: '执行中——日志自动更新'
  },
  'schedule.cronEveryMinute': {
    en: 'Every minute',
    cn: '每分钟'
  },
  'schedule.cronEvery5Min': {
    en: 'Every 5 minutes',
    cn: '每 5 分钟'
  },
  'schedule.cronEveryHour': {
    en: 'Every hour',
    cn: '每小时'
  },
  'schedule.cronDailyMidnight': {
    en: 'Every day at midnight',
    cn: '每天午夜'
  },

  // MCP Servers Panel
  'mcpPanel.title': {
    en: 'MCP Servers',
    cn: 'MCP 服务器'
  },
  'mcpPanel.installed': {
    en: 'Installed',
    cn: '已安装'
  },
  'mcpPanel.noServers': {
    en: 'No MCP servers in this session',
    cn: '此会话中无 MCP 服务器'
  },
  'mcpPanel.noServersHint': {
    en: 'Add servers to extend agent capabilities',
    cn: '添加服务器以扩展智能体能力'
  },
  'mcpPanel.removeFromSession': {
    en: 'Remove from session',
    cn: '从会话中移除'
  },
  'mcpPanel.addServer': {
    en: 'Add MCP Server',
    cn: '添加 MCP 服务器'
  },
  'mcpPanel.serverName': {
    en: 'Server name (e.g. my-server)',
    cn: '服务器名称（如 my-server）'
  },
  'mcpPanel.command': {
    en: 'Command (e.g. npx)',
    cn: '命令（如 npx）'
  },
  'mcpPanel.arguments': {
    en: 'Arguments (space-separated, e.g. -y @org/server)',
    cn: '参数（空格分隔，如 -y @org/server）'
  },
  'mcpPanel.serverUrl': {
    en: 'Server URL (e.g. http://localhost:8080/sse)',
    cn: '服务器 URL（如 http://localhost:8080/sse）'
  },
  'mcpPanel.browseServers': {
    en: 'Browse Servers',
    cn: '浏览服务器'
  },
  'mcpPanel.servers': {
    en: 'servers',
    cn: '个服务器'
  },
  'mcpPanel.searchPlaceholder': {
    en: 'Search MCP servers...',
    cn: '搜索 MCP 服务器...'
  },
  'mcpPanel.noMatch': {
    en: 'No servers match "{q}"',
    cn: '没有匹配「{q}」的服务器'
  },
  'mcpPanel.added': {
    en: 'Added',
    cn: '已添加'
  },
  'mcpPanel.managed': {
    en: 'Managed',
    cn: '托管'
  },
  'mcpPanel.viewDocs': {
    en: 'View docs',
    cn: '查看文档'
  },
  'mcpPanel.footer': {
    en: 'MCP servers added here apply to this session only. Changes take effect on the next message.',
    cn: '此处添加的 MCP 服务器仅适用于当前会话，更改将在下一条消息时生效。'
  },

  // IM Channels Panel
  'im.title': {
    en: 'IM Channels',
    cn: 'IM 渠道'
  },
  'im.addChannel': {
    en: 'Add Channel',
    cn: '添加渠道'
  },
  'im.connectDesc': {
    en: 'Connect messaging platforms so users can chat with {name} via Slack, Discord, WeCom, etc.',
    cn: '连接消息平台，让用户可以通过 Slack、Discord、企业微信等与 {name} 对话。'
  },
  'im.dismiss': {
    en: 'Dismiss',
    cn: '关闭'
  },
  'im.displayName': {
    en: 'Display Name (optional)',
    cn: '显示名称（可选）'
  },
  'im.connectChannel': {
    en: 'Connect Channel',
    cn: '连接渠道'
  },
  'im.confirmRemove': {
    en: 'Remove this IM channel binding?',
    cn: '移除此 IM 渠道绑定？'
  },
  'im.noChannels': {
    en: 'No IM channels connected yet.',
    cn: '尚未连接 IM 渠道。'
  },
  'im.noChannelsHint': {
    en: 'Add a channel to let users chat with this scope from Slack, Discord, or other platforms.',
    cn: '添加渠道，让用户可以从 Slack、Discord 或其他平台与此范围对话。'
  },
  'im.disabled': {
    en: 'Disabled',
    cn: '已禁用'
  },
  'im.connectionMode': {
    en: 'Connection Mode',
    cn: '连接模式'
  },
  'im.outgoingWebhook': {
    en: 'Outgoing Webhook',
    cn: '外发 Webhook'
  },
  'im.simpleHttp': {
    en: 'Simple, HTTP-based',
    cn: '简单，基于 HTTP'
  },
  'im.streamWs': {
    en: 'Stream (WebSocket)',
    cn: 'Stream（WebSocket）'
  },
  'im.fullFeatured': {
    en: 'Full-featured, real-time',
    cn: '功能完整，实时'
  },

  // Skills Panel
  'skills.title': {
    en: 'Skills',
    cn: '技能'
  },
  'skills.tabInstalled': {
    en: 'Installed',
    cn: '已安装'
  },
  'skills.tabInternal': {
    en: 'Internal',
    cn: '内部'
  },
  'skills.tabExternal': {
    en: 'External',
    cn: '外部'
  },
  'skills.noSession': {
    en: 'No active session',
    cn: '无活跃会话'
  },
  'skills.noSkills': {
    en: 'No skills in this workspace',
    cn: '此工作区无技能'
  },
  'skills.deleteSkill': {
    en: 'Delete skill',
    cn: '删除技能'
  },
  'skills.categoryOptional': {
    en: 'Category (optional)',
    cn: '分类（可选）'
  },
  'skills.publishToGroups': {
    en: 'Publish to groups:',
    cn: '发布到分组：'
  },
  'skills.noGroupsHint': {
    en: 'No groups yet. Create groups in Settings → Groups.',
    cn: '暂无分组。请在设置 → 分组中创建。'
  },
  'skills.noGroupsWarning': {
    en: '⚠ No groups selected — this skill will be visible to everyone.',
    cn: '⚠ 未选择分组——此技能将对所有人可见。'
  },
  'skills.publishing': {
    en: 'Publishing…',
    cn: '发布中…'
  },
  'skills.confirm': {
    en: 'Confirm',
    cn: '确认'
  },
  'skills.publishToInternal': {
    en: 'Publish to Internal',
    cn: '发布到内部'
  },
  'skills.searchInternal': {
    en: 'Search internal skills...',
    cn: '搜索内部技能...'
  },
  'skills.allCategories': {
    en: 'All categories',
    cn: '所有分类'
  },
  'skills.popular': {
    en: 'Popular',
    cn: '热门'
  },
  'skills.topRated': {
    en: 'Top Rated',
    cn: '最高评分'
  },
  'skills.recent': {
    en: 'Recent',
    cn: '最新'
  },
  'skills.noInternal': {
    en: 'No internal skills yet',
    cn: '暂无内部技能'
  },
  'skills.noInternalHint': {
    en: 'Import from External or publish from a workspace',
    cn: '从外部导入或从工作区发布'
  },
  'skills.installs': {
    en: 'installs',
    cn: '次安装'
  },
  'skills.installed': {
    en: 'Installed',
    cn: '已安装'
  },
  'skills.install': {
    en: 'Install',
    cn: '安装'
  },
  'skills.searchMarketplace': {
    en: 'Search skills.sh marketplace...',
    cn: '搜索 skills.sh 市场...'
  },
  'skills.searchingMarketplace': {
    en: 'Searching marketplace...',
    cn: '搜索市场中...'
  },
  'skills.popularOnSkillsSh': {
    en: 'Popular on skills.sh',
    cn: 'skills.sh 上的热门技能'
  },
  'skills.importToInternal': {
    en: 'Import to Internal',
    cn: '导入到内部'
  },
  'skills.loadingPopular': {
    en: 'Loading popular skills...',
    cn: '加载热门技能...'
  },
  'skills.noResults': {
    en: 'No results for "{q}"',
    cn: '未找到「{q}」的结果'
  },
  'skills.searchPrompt': {
    en: 'Search the skills.sh marketplace',
    cn: '搜索 skills.sh 市场'
  },
  'skills.searchPromptHint': {
    en: 'Find community skills, then install or import to internal',
    cn: '查找社区技能，然后安装或导入到内部'
  },

  // Skill Workshop
  'workshop.title': {
    en: 'Skill Workshop',
    cn: '技能工坊'
  },
  'workshop.skillsEquipped': {
    en: '{n} skill(s) equipped',
    cn: '已装备 {n} 个技能'
  },
  'workshop.saveSkills': {
    en: 'Save Skills',
    cn: '保存技能'
  },
  'workshop.chatEmpty': {
    en: 'Send a message to test the agent with equipped skills',
    cn: '发送消息以测试装备了技能的智能体'
  },
  'workshop.chatEmptyHint': {
    en: 'Equip skills from the right panel, then chat to see how they work',
    cn: '从右侧面板装备技能，然后对话查看效果'
  },
  'workshop.equip': {
    en: 'Equip',
    cn: '装备'
  },
  'workshop.consolidate': {
    en: 'Consolidate',
    cn: '整合'
  },
  'workshop.back': {
    en: 'Back',
    cn: '返回'
  },
  'workshop.equipped': {
    en: 'Equipped',
    cn: '已装备'
  },
  'workshop.noEquipped': {
    en: 'No skills equipped',
    cn: '未装备技能'
  },
  'workshop.noEquippedHint': {
    en: 'Browse installed skills or the marketplace to equip',
    cn: '浏览已安装技能或市场来装备'
  },
  'workshop.noInstalled': {
    en: 'No skills installed',
    cn: '未安装技能'
  },
  'workshop.noInstalledHint': {
    en: 'Install skills from the marketplace first',
    cn: '请先从市场安装技能'
  },
  'workshop.searching': {
    en: 'Searching...',
    cn: '搜索中...'
  },
  'workshop.details': {
    en: 'Details',
    cn: '详情'
  },
  'workshop.installEquip': {
    en: 'Install & Equip',
    cn: '安装并装备'
  },
  'workshop.noResults': {
    en: 'No results for "{q}"',
    cn: '未找到「{q}」的结果'
  },
  'workshop.searchSkills': {
    en: 'Search skills...',
    cn: '搜索技能...'
  },
  'workshop.noDocs': {
    en: 'No documentation found',
    cn: '未找到文档'
  },

  // Scope Profile
  'scopeProfile.healthCheck': {
    en: 'Business Health Check',
    cn: '业务健康检查'
  },
  'scopeProfile.comingSoon': {
    en: 'Coming Soon',
    cn: '即将推出'
  },
  'scopeProfile.deleteScope': {
    en: 'Delete scope',
    cn: '删除范围'
  },
  'scopeProfile.agents': {
    en: 'Agents',
    cn: '智能体'
  },
  'scopeProfile.tasksDone': {
    en: 'Tasks Done',
    cn: '已完成任务'
  },
  'scopeProfile.responseRate': {
    en: 'Response Rate',
    cn: '响应率'
  },
  'scopeProfile.systemPrompt': {
    en: 'System Prompt',
    cn: '系统提示词'
  },
  'scopeProfile.noPrompt': {
    en: 'No system prompt defined. Click Edit to add one.',
    cn: '未定义系统提示词。点击编辑添加。'
  },
  'scopeProfile.promptPlaceholder': {
    en: 'Define the behavior and personality for this scope...',
    cn: '定义此范围的行为和个性...'
  },
  'scopeProfile.skillsEquipped': {
    en: 'equipped',
    cn: '已装备'
  },
  'scopeProfile.loadingSkills': {
    en: 'Loading skills...',
    cn: '加载技能中...'
  },
  'scopeProfile.noSkillsEquipped': {
    en: 'No skills equipped',
    cn: '未装备技能'
  },
  'scopeProfile.noSkillsHint': {
    en: 'Skills can be added from the Skill Workshop or API integrations.',
    cn: '可以从技能工坊或 API 集成中添加技能。'
  },
  'scopeProfile.whatsHappened': {
    en: "What's Happened",
    cn: '最近动态'
  },
  'scopeProfile.briefingsSubtitle': {
    en: 'AI-summarized task briefings',
    cn: 'AI 摘要任务简报'
  },
  'scopeProfile.loadingBriefings': {
    en: 'Loading briefings...',
    cn: '加载简报中...'
  },
  'scopeProfile.noHistory': {
    en: 'No task history yet',
    cn: '暂无任务历史'
  },
  'scopeProfile.addAgent': {
    en: 'Add Agent',
    cn: '添加智能体'
  },
  'scopeProfile.noAgents': {
    en: 'No agents',
    cn: '无智能体'
  },
  'scopeProfile.noAgentsAvailable': {
    en: 'No agents available.',
    cn: '无可用智能体。'
  },
  'scopeProfile.allAssigned': {
    en: 'All agents are already assigned to this scope.',
    cn: '所有智能体已分配到此范围。'
  },
  'scopeProfile.tasks': {
    en: 'tasks',
    cn: '个任务'
  },
  'scopeProfile.noMcpServers': {
    en: 'No MCP servers assigned',
    cn: '未分配 MCP 服务器'
  },
  'scopeProfile.noMcpConfigured': {
    en: 'No MCP servers configured.',
    cn: '未配置 MCP 服务器。'
  },
  'scopeProfile.allMcpAssigned': {
    en: 'All servers already assigned.',
    cn: '所有服务器已分配。'
  },
  'scopeProfile.configured': {
    en: 'configured',
    cn: '已配置'
  },
  'scopeProfile.testSkill': {
    en: 'Test',
    cn: '测试'
  },
  'scopeProfile.configure': {
    en: 'Configure',
    cn: '配置'
  },
  'scopeProfile.removeFromScope': {
    en: 'Remove',
    cn: '移除'
  },
  'scopeProfile.statusCompleted': {
    en: 'Completed',
    cn: '已完成'
  },
  'scopeProfile.statusFlagged': {
    en: 'Flagged',
    cn: '已标记'
  },
  'scopeProfile.statusInProgress': {
    en: 'In Progress',
    cn: '进行中'
  },
  'scopeProfile.statusEscalated': {
    en: 'Escalated',
    cn: '已升级'
  },

  // Agent Profile
  'agentProfile.enableAgent': {
    en: 'Enable agent',
    cn: '启用智能体'
  },
  'agentProfile.disableAgent': {
    en: 'Disable agent',
    cn: '禁用智能体'
  },
  'agentProfile.removeAgent': {
    en: 'Remove agent',
    cn: '移除智能体'
  },
  'agentProfile.noDescription': {
    en: 'No description',
    cn: '无描述'
  },
  'agentProfile.executionLogs': {
    en: 'Execution Logs',
    cn: '执行日志'
  },
  'agentProfile.noHistory': {
    en: 'No execution history yet',
    cn: '暂无执行历史'
  },
  'agentProfile.mcpServers': {
    en: 'MCP Servers',
    cn: 'MCP 服务器'
  },
  'agentProfile.manage': {
    en: 'Manage',
    cn: '管理'
  },
  'agentProfile.eventSubAgent': {
    en: 'Sub-agent',
    cn: '子智能体'
  },
  'agentProfile.eventTool': {
    en: 'Tool',
    cn: '工具'
  },
  'agentProfile.eventSkill': {
    en: 'Skill',
    cn: '技能'
  },
  'agentProfile.eventComplete': {
    en: 'Complete',
    cn: '完成'
  },

  // App Runner
  'appRunner.loading': {
    en: 'Loading app...',
    cn: '加载应用中...'
  },
  'appRunner.notFound': {
    en: 'App not found',
    cn: '未找到应用'
  },
  'appRunner.backToMarketplace': {
    en: 'Back to Marketplace',
    cn: '返回应用市场'
  },
  'appRunner.openInNewTab': {
    en: 'Open in new tab',
    cn: '在新标签页打开'
  },
  'appRunner.sampleNoPreview': {
    en: 'This is a sample app — no live preview available',
    cn: '这是示例应用——无实时预览'
  },
  'appRunner.publishHint': {
    en: 'Publish a real app from the chat to see it running here',
    cn: '从对话中发布真实应用即可在此运行'
  },
  'appRunner.published': {
    en: 'Published',
    cn: '发布于'
  },
  'appRunner.runs': {
    en: 'runs',
    cn: '次运行'
  },
  'appRunner.ratings': {
    en: 'ratings',
    cn: '个评分'
  },
  'appRunner.runApp': {
    en: 'Run App',
    cn: '运行应用'
  },
  'appRunner.removeFromFav': {
    en: 'Remove from favorites',
    cn: '取消收藏'
  },
  'appRunner.addToFav': {
    en: 'Add to favorites',
    cn: '添加收藏'
  },
  'appRunner.deleteApp': {
    en: 'Delete app',
    cn: '删除应用'
  },
  'appRunner.screenshotPreview': {
    en: 'Screenshot preview',
    cn: '截图预览'
  },
  'appRunner.about': {
    en: 'About',
    cn: '关于'
  },
  'appRunner.ratingsTitle': {
    en: 'Ratings',
    cn: '评分'
  },
  'appRunner.noRatings': {
    en: 'No ratings yet',
    cn: '暂无评分'
  },
  'appRunner.reviews': {
    en: 'Reviews',
    cn: '评论'
  },
  'appRunner.noReviews': {
    en: 'No reviews yet. Be the first to leave one!',
    cn: '暂无评论，来写第一条吧！'
  },
  'appRunner.versionHistory': {
    en: 'Version History',
    cn: '版本历史'
  },
  'appRunner.deleteTitle': {
    en: 'Delete App',
    cn: '删除应用'
  },
  'appRunner.deleteWarning': {
    en: 'This action cannot be undone',
    cn: '此操作无法撤销'
  },
  'appRunner.deleteConfirm': {
    en: 'Are you sure you want to permanently delete',
    cn: '确定要永久删除'
  },
  'appRunner.deleteConfirmSuffix': {
    en: '? This will remove the app, all ratings, usage history, and version data.',
    cn: '吗？这将移除应用、所有评分、使用历史和版本数据。'
  },
  'appRunner.deleting': {
    en: 'Deleting...',
    cn: '删除中...'
  },

  // Project Board
  'project.backlog': { en: 'Backlog', cn: '待办' },
  'project.todo': { en: 'Todo', cn: '待处理' },
  'project.inProgress': { en: 'In Progress', cn: '进行中' },
  'project.inReview': { en: 'In Review', cn: '审核中' },
  'project.done': { en: 'Done', cn: '已完成' },
  'project.cancelled': { en: 'Cancelled', cn: '已取消' },
  'project.notFound': { en: 'Project not found', cn: '未找到项目' },
  'project.newIssue': { en: 'New Issue', cn: '新建问题' },
  'project.settings': { en: 'Project Settings', cn: '项目设置' },
  'project.syncWorkspace': { en: 'Sync workspace from S3', cn: '从 S3 同步工作区' },
  'project.agentConsole': { en: 'Agent Console', cn: '智能体控制台' },
  'project.colTitle': { en: 'Title', cn: '标题' },
  'project.colStatus': { en: 'Status', cn: '状态' },
  'project.colPriority': { en: 'Priority', cn: '优先级' },
  'project.colCreator': { en: 'Creator', cn: '创建者' },
  'project.colCreated': { en: 'Created', cn: '创建时间' },
  'project.deleteIssue': { en: 'Delete issue', cn: '删除问题' },
  'project.deleteIssueConfirm': { en: 'Delete this issue?', cn: '删除此问题？' },
  'project.title': { en: 'Title', cn: '标题' },
  'project.description': { en: 'Description', cn: '描述' },
  'project.descPlaceholder': { en: 'Describe the task in detail...', cn: '详细描述任务...' },
  'project.aiBeautify': { en: 'AI Refine', cn: 'AI 精炼' },
  'project.aiBeautifyHint': { en: 'Use AI to refine and enrich this description', cn: '使用 AI 精炼和充实描述' },
  'project.status': { en: 'Status', cn: '状态' },
  'project.priority': { en: 'Priority', cn: '优先级' },
  'project.branch': { en: 'Branch', cn: '分支' },
  'project.createdBy': { en: 'Created by', cn: '创建者' },
  'project.projectAgent': { en: 'Project Agent', cn: '项目智能体' },
  'project.customAgent': { en: 'Custom Agent', cn: '自定义智能体' },
  'project.defaultAgent': { en: 'Default Claude Code Agent', cn: '默认 Claude Code 智能体' },
  'project.comments': { en: 'Comments', cn: '评论' },
  'project.noComments': { en: 'No comments yet.', cn: '暂无评论。' },
  'project.addComment': { en: 'Add a comment...', cn: '添加评论...' },
  'project.saving': { en: 'Saving...', cn: '保存中...' },
  'project.saveChanges': { en: 'Save Changes', cn: '保存更改' },
  'project.working': { en: 'Working...', cn: '处理中...' },
  'project.businessScope': { en: 'Business Scope', cn: '业务范围' },
  'project.noScopeOption': { en: '— None (agent execution disabled) —', cn: '— 无（智能体执行已禁用）—' },
  'project.noScopeWarning': { en: 'A business scope is required for agent execution. Without it, tasks cannot be automatically processed.', cn: '智能体执行需要业务范围。没有它，任务无法自动处理。' },
  'project.agent': { en: 'Agent', cn: '智能体' },
  'project.defaultScopeAgent': { en: "Default (scope's primary agent)", cn: '默认（范围主智能体）' },
  'project.saveScopeAgent': { en: 'Save Scope & Agent', cn: '保存范围和智能体' },
  'project.autoProcess': { en: 'Auto-process Todo items', cn: '自动处理待处理项' },
  'project.autoProcessDesc': { en: 'Automatically picks up Todo items and assigns them to the agent.', cn: '自动获取待处理项并分配给智能体。' },
  'project.criticalPriority': { en: '🔴 Critical', cn: '🔴 紧急' },
  'project.highPriority': { en: '🟠 High', cn: '🟠 高' },
  'project.mediumPriority': { en: '🟡 Medium', cn: '🟡 中' },
  'project.lowPriority': { en: '🟢 Low', cn: '🟢 低' },

  // Marketplace
  'marketplace.title': { en: 'App Marketplace', cn: '应用市场' },
  'marketplace.apps': { en: 'apps', cn: '个应用' },
  'marketplace.searchPlaceholder': { en: 'Search apps...', cn: '搜索应用...' },
  'marketplace.loading': { en: 'Loading apps...', cn: '加载应用中...' },
  'marketplace.trending': { en: 'Trending', cn: '热门' },
  'marketplace.recentlyUsed': { en: 'Recently Used', cn: '最近使用' },
  'marketplace.favorites': { en: 'Favorites', cn: '收藏' },
  'marketplace.allApps': { en: 'All Apps', cn: '所有应用' },
  'marketplace.noResults': { en: 'No apps match your search', cn: '没有匹配的应用' },
  'marketplace.noDescription': { en: 'No description', cn: '无描述' },
  'marketplace.noRatings': { en: 'No ratings yet', cn: '暂无评分' },
  'marketplace.run': { en: 'Run', cn: '运行' },
  'marketplace.runs': { en: 'runs', cn: '次运行' },

  // MCP Configurator
  'mcpConfig.validationNameRequired': { en: 'Server name is required', cn: '服务器名称为必填项' },
  'mcpConfig.validationCommandRequired': { en: 'Command is required', cn: '命令为必填项' },
  'mcpConfig.validationUrlRequired': { en: 'URL is required', cn: 'URL 为必填项' },
  'mcpConfig.fixValidation': { en: 'Please fix validation errors', cn: '请修正验证错误' },
  'mcpConfig.serverUpdated': { en: 'Server updated successfully', cn: '服务器更新成功' },
  'mcpConfig.serverCreated': { en: 'Server created successfully', cn: '服务器创建成功' },
  'mcpConfig.serverDeleted': { en: 'Server deleted successfully', cn: '服务器删除成功' },
  'mcpConfig.confirmDeleteServer': { en: 'Are you sure you want to delete this server?', cn: '确定要删除此服务器吗？' },
  'mcpConfig.serverType': { en: 'Server Type', cn: '服务器类型' },
  'mcpConfig.stdioCommand': { en: 'stdio (command)', cn: 'stdio（命令）' },
  'mcpConfig.sseHttp': { en: 'SSE / HTTP (URL)', cn: 'SSE / HTTP（URL）' },
  'mcpConfig.command': { en: 'Command', cn: '命令' },
  'mcpConfig.arguments': { en: 'Arguments', cn: '参数' },
  'mcpConfig.argumentsHint': { en: 'Space-separated arguments passed to the command', cn: '传递给命令的空格分隔参数' },
  'mcpConfig.envVars': { en: 'Environment Variables', cn: '环境变量' },
  'mcpConfig.addVariable': { en: '+ Add variable', cn: '+ 添加变量' },
  'mcpConfig.noEnvVars': { en: 'No environment variables configured', cn: '未配置环境变量' },
  'mcpConfig.serverUrl': { en: 'Server URL', cn: '服务器 URL' },
  'mcpConfig.headersHintShort': { en: 'JSON format for custom request headers', cn: 'JSON 格式的自定义请求头' },

  // Agent Configurator
  'agentConfig.createTitle': { en: 'Create New Agent', cn: '创建新智能体' },
  'agentConfig.createSubtitle': { en: 'Configure your new agent', cn: '配置您的新智能体' },
  'agentConfig.skillWorkshop': { en: 'Skill Workshop', cn: '技能工坊' },
  'agentConfig.nameRequired': { en: 'Name and display name are required', cn: '名称和显示名称为必填项' },
  'agentConfig.agentCreated': { en: 'Agent created successfully', cn: '智能体创建成功' },
  'agentConfig.upload': { en: 'Upload', cn: '上传' },
  'agentConfig.editSkill': { en: 'Edit skill', cn: '编辑技能' },
  'agentConfig.removeSkill': { en: 'Remove skill', cn: '移除技能' },
  'agentConfig.editingSkill': { en: 'Editing skill...', cn: '编辑技能中...' },
  'agentConfig.updateSkill': { en: 'Update Skill', cn: '更新技能' },
  'agentConfig.addSkill': { en: 'Add Skill', cn: '添加技能' },
  'agentConfig.skillUpdated': { en: 'Skill updated successfully', cn: '技能更新成功' },
  'agentConfig.statusActive': { en: 'Active', cn: '活跃' },
  'agentConfig.statusDisabled': { en: 'Disabled', cn: '已禁用' },

  // Digital Twin Wizard
  'twin.title': { en: 'Create Digital Twin', cn: '创建数字分身' },
  'twin.subtitle': { en: 'Build an AI version of yourself', cn: '构建你的 AI 版本' },
  'twin.stepIdentity': { en: 'Identity', cn: '身份' },
  'twin.stepIdentityDesc': { en: 'Who are you?', cn: '你是谁？' },
  'twin.stepKnowledge': { en: 'Knowledge', cn: '知识' },
  'twin.stepKnowledgeDesc': { en: 'What do you know?', cn: '你知道什么？' },
  'twin.stepSkills': { en: 'Skills', cn: '技能' },
  'twin.stepSkillsDesc': { en: 'What can you do?', cn: '你能做什么？' },
  'twin.stepPublish': { en: 'Publish', cn: '发布' },
  'twin.stepPublishDesc': { en: 'Review & create', cn: '审核并创建' },
  'twin.identityTitle': { en: 'Who are you?', cn: '你是谁？' },
  'twin.identitySubtitle': { en: 'Upload your photo and describe yourself', cn: '上传照片并描述自己' },
  'twin.photo': { en: 'Photo', cn: '照片' },
  'twin.clickToUpload': { en: 'Click to upload your photo', cn: '点击上传照片' },
  'twin.displayName': { en: 'Display Name', cn: '显示名称' },
  'twin.roleTitle': { en: 'Role / Title', cn: '角色 / 职位' },
  'twin.aboutYou': { en: 'About You', cn: '关于你' },
  'twin.systemPrompt': { en: 'System Prompt', cn: '系统提示词' },
  'twin.generating': { en: 'Generating...', cn: '生成中...' },
  'twin.aiGenerate': { en: 'AI Generate', cn: 'AI 生成' },
  'twin.knowledgeTitle': { en: 'What do you know?', cn: '你知道什么？' },
  'twin.knowledgeSubtitle': { en: 'Upload documents that represent your expertise', cn: '上传代表你专业知识的文档' },
  'twin.dropFiles': { en: 'Drop files here or click to upload', cn: '拖放文件或点击上传' },
  'twin.fileFormats': { en: 'PDF, DOC, TXT, MD — up to 50MB each', cn: 'PDF、DOC、TXT、MD — 每个最大 50MB' },
  'twin.filesUploaded': { en: '{n} file(s) uploaded', cn: '已上传 {n} 个文件' },
  'twin.skillsTitle': { en: 'What can you do?', cn: '你能做什么？' },
  'twin.skillsSubtitle': { en: 'Choose whether AI should generate skills for your digital twin', cn: '选择是否让 AI 为你的数字分身生成技能' },
  'twin.skipSkills': { en: 'Skip skill generation', cn: '跳过技能生成' },
  'twin.skipSkillsDesc': { en: 'Create the digital twin without any skills — you can add them later', cn: '不生成技能创建数字分身——稍后可以添加' },
  'twin.noSkillsGenerated': { en: 'No skills will be generated', cn: '不会生成技能' },
  'twin.skillsWillGenerate': { en: 'AI will generate skills based on your role & documents', cn: 'AI 将根据你的角色和文档生成技能' },
  'twin.readyToCreate': { en: 'Ready to create', cn: '准备创建' },
  'twin.reviewAndCreate': { en: 'Review your digital twin and click Create', cn: '审核你的数字分身并点击创建' },
  'twin.summary': { en: 'Summary', cn: '摘要' },
  'twin.unnamed': { en: 'Unnamed', cn: '未命名' },
  'twin.noRole': { en: 'No role set', cn: '未设置角色' },
  'twin.noSkills': { en: 'No skills', cn: '无技能' },
  'twin.aiGeneratedSkills': { en: 'AI-generated skills', cn: 'AI 生成的技能' },
  'twin.back': { en: 'Back', cn: '返回' },
  'twin.confirmCreate': { en: 'Confirm & Create', cn: '确认并创建' },
  'twin.creating': { en: 'Creating...', cn: '创建中...' },
  'twin.createButton': { en: 'Create Digital Twin', cn: '创建数字分身' },
  'twin.next': { en: 'Next', cn: '下一步' },
  'twin.cancelGoBack': { en: 'Cancel & Go Back', cn: '取消并返回' },

  // Showcase Page
  'showcase.title': { en: 'Enterprise Agent Showcase', cn: '企业Agent大赏' },
  'showcase.featured': { en: 'Featured Cases', cn: '精选案例' },
  'showcase.manageCategories': { en: 'Manage categories', cn: '管理分类' },
  'showcase.loading': { en: 'Loading...', cn: '加载中...' },
  'showcase.empty': { en: 'No showcase cases yet', cn: '暂无展示案例' },
  'showcase.emptyHint': { en: 'Click the gear icon to configure industries and domains.', cn: '点击右上角齿轮图标配置行业和领域。' },
  'showcase.noDomains': { en: 'No domains configured for this industry. Add them in the admin panel.', cn: '该行业暂无配置领域，请在右侧管理面板添加。' },
  'showcase.categoryManagement': { en: 'Category Management', cn: '分类管理' },
  'showcase.industries': { en: 'Industries', cn: '行业分类' },
  'showcase.noIndustries': { en: 'No industries yet. Click + to add.', cn: '暂无行业，点击 + 添加' },
  'showcase.domains': { en: 'Domains', cn: '业务领域' },
  'showcase.noDomains2': { en: 'No domains yet. Click + to add.', cn: '暂无领域，点击 + 添加' },
  'showcase.addIndustry': { en: 'Add industry', cn: '添加行业' },
  'showcase.industryNamePlaceholder': { en: 'Industry name (e.g. FMCG)', cn: '行业名称（如：快消品）' },
  'showcase.slugPlaceholder': { en: 'slug (e.g. fmcg)', cn: 'slug（如：fmcg）' },
  'showcase.addDomain': { en: 'Add domain', cn: '添加领域' },
  'showcase.iconPlaceholder': { en: 'Icon', cn: '图标' },
  'showcase.domainNamePlaceholder': { en: 'Domain name (e.g. Quality)', cn: '领域名称（如：质量保障）' },
  'showcase.enNamePlaceholder': { en: 'English name (optional)', cn: '英文名（可选）' },
  'showcase.aiSuggesting': { en: 'AI suggesting...', cn: 'AI 生成中...' },
  'showcase.enNameOptionalPlaceholder': { en: 'English name (optional, e.g. Quality)', cn: '英文名（可选，如：Quality）' },
  'showcase.add': { en: 'Add', cn: '添加' },
  'showcase.save': { en: 'Save', cn: '保存' },
  'showcase.edit': { en: 'Edit', cn: '编辑' },
  'showcase.deleteIndustryConfirm': { en: 'Delete industry "{name}" and all its domains and cases?', cn: '确定删除行业「{name}」及其所有领域和案例？' },
  'showcase.deleteDomainConfirm': { en: 'Delete domain "{name}" and all its cases?', cn: '确定删除领域「{name}」及其所有案例？' },
  'showcase.cases': { en: 'cases', cn: '案例' },

  // Workflow Editor
  'workflowEditor.workflows': { en: 'Workflows', cn: '工作流' },
  'workflowEditor.selectScope': { en: 'Select scope', cn: '选择范围' },
  'workflowEditor.expandList': { en: 'Expand workflow list', cn: '展开工作流列表' },
  'workflowEditor.collapsePanel': { en: 'Collapse panel', cn: '折叠面板' },
  'workflowEditor.noWorkflows': { en: 'No workflows in this scope', cn: '此范围无工作流' },
  'workflowEditor.unsavedChanges': { en: 'Unsaved changes', cn: '未保存的更改' },
  'workflowEditor.executionHistory': { en: 'Execution History', cn: '执行历史' },
  'workflowEditor.noHistory': { en: 'No executions yet', cn: '暂无执行记录' },
  'workflowEditor.save': { en: 'Save', cn: '保存' },
  'workflowEditor.run': { en: 'Run', cn: '运行' },
  'workflowEditor.stop': { en: 'Stop', cn: '停止' },
  'workflowEditor.executing': { en: 'Executing workflow...', cn: '执行工作流中...' },
  'workflowEditor.selectWorkflow': { en: 'Select a workflow to view', cn: '选择一个工作流查看' },
  'workflowEditor.deleteWorkflow': { en: 'Delete Workflow', cn: '删除工作流' },
  'workflowEditor.clickToRename': { en: 'Click to rename', cn: '点击重命名' },
  'workflowEditor.rename': { en: 'Rename', cn: '重命名' },
  'workflowEditor.promoteToOfficial': { en: 'Promote to Official', cn: '升级为正式版' },

  // Tools Page
  'tools.allTools': { en: 'All Tools', cn: '所有工具' },
  'tools.skills': { en: 'Skills', cn: '技能' },
  'tools.mcpServers': { en: 'MCP Servers', cn: 'MCP 服务器' },
  'tools.plugins': { en: 'Plugins', cn: '插件' },
  'tools.all': { en: 'All', cn: '全部' },
  'tools.internal': { en: 'Internal', cn: '内部' },
  'tools.marketplace': { en: 'Marketplace', cn: '市场' },
  'tools.searchTools': { en: 'Search tools...', cn: '搜索工具...' },
  'tools.searchMarketplace': { en: 'Search skills.sh marketplace...', cn: '搜索 skills.sh 市场...' },
  'tools.import': { en: 'Import', cn: '导入' },
  'tools.importSkill': { en: 'Import Skill', cn: '导入技能' },
  'tools.fromGitHub': { en: 'From GitHub URL', cn: '从 GitHub URL' },
  'tools.uploadZip': { en: 'Upload .zip', cn: '上传 .zip' },
  'tools.searchingMarketplace': { en: 'Searching skills.sh...', cn: '搜索 skills.sh 中...' },
  'tools.loadingMarketplace': { en: 'Loading marketplace skills...', cn: '加载市场技能...' },
  'tools.noResults': { en: 'No tools match your search', cn: '没有匹配的工具' },
  'tools.noMarketResults': { en: 'No skills found for "{q}" on skills.sh', cn: '在 skills.sh 上未找到「{q}」的技能' },
  'tools.dropZip': { en: 'Drop a .zip or .tar.gz file here, or click to browse', cn: '拖放 .zip 或 .tar.gz 文件，或点击浏览' },
  'tools.uploadInstall': { en: 'Upload & Install', cn: '上传并安装' },
  'tools.processing': { en: 'Processing...', cn: '处理中...' },
  'tools.installing': { en: 'Installing...', cn: '安装中...' },
  'tools.noSkillMd': { en: 'No SKILL.md files found in the archive.', cn: '压缩包中未找到 SKILL.md 文件。' },

  // Chat Page
  'chat.selectScopeOrAgent': { en: 'Select scope or agent', cn: '选择范围或智能体' },
  'chat.searchScopesAgents': { en: 'Search scopes or agents...', cn: '搜索范围或智能体...' },
  'chat.businessScopes': { en: 'Business Scopes', cn: '业务范围' },
  'chat.independentAgents': { en: 'Independent Agents', cn: '独立智能体' },
  'chat.noResultsFound': { en: 'No results found', cn: '未找到结果' },
  'chat.loadingScopes': { en: 'Loading scopes...', cn: '加载范围中...' },
  'chat.selectScope': { en: 'Select scope', cn: '选择范围' },
  'chat.noScopesAvailable': { en: 'No scopes available', cn: '无可用范围' },
  'chat.uploadToWorkspace': { en: 'Upload files to workspace', cn: '上传文件到工作区' },
  'chat.stopGeneration': { en: 'Stop generation', cn: '停止生成' },
  'chat.groupChat': { en: 'Group Chat', cn: '群聊' },
  'chat.groupChatHint': { en: 'Create a group chat room with multiple agents', cn: '创建多智能体群聊房间' },
  'chat.saveToMemory': { en: 'Save to Memory', cn: '保存到记忆' },
  'chat.saveToMemoryHint': { en: 'Save session to scope memory', cn: '保存会话到范围记忆' },
  'chat.clear': { en: 'Clear', cn: '清除' },
  'chat.clearConversation': { en: 'Clear conversation', cn: '清除对话' },
  'chat.startConversation': { en: 'Start a Conversation', cn: '开始对话' },
  'chat.startConversationHint': { en: 'Choose a business scope or an independent agent from the dropdown above to start chatting.', cn: '从上方下拉菜单选择业务范围或独立智能体开始对话。' },
  'chat.upload': { en: 'Upload', cn: '上传' },
  'chat.dropFilesHere': { en: 'Drop files here or click to browse', cn: '拖放文件或点击浏览' },
  'chat.closeTab': { en: 'Close tab', cn: '关闭标签' },
  'chat.loading': { en: 'Loading...', cn: '加载中...' },
  'chat.failedToLoadFile': { en: 'Failed to load file', cn: '文件加载失败' },
  'chat.failedToLoadImage': { en: 'Failed to load image', cn: '图片加载失败' },
  'chat.failedToParseExcel': { en: 'Failed to parse Excel file', cn: 'Excel 文件解析失败' },
  'chat.cannotPreview': { en: 'This file type cannot be previewed.', cn: '此文件类型无法预览。' },
  'chat.view': { en: 'View', cn: '查看' },
  'chat.edit': { en: 'Edit', cn: '编辑' },
  'chat.preview': { en: 'Preview', cn: '预览' },
  'chat.save': { en: 'Save', cn: '保存' },
  'chat.saving': { en: 'Saving...', cn: '保存中...' },
  'chat.saved': { en: 'Saved', cn: '已保存' },
  'chat.download': { en: 'Download', cn: '下载' },
  'chat.downloadFile': { en: 'Download file', cn: '下载文件' },
  'chat.refresh': { en: 'Refresh', cn: '刷新' },
  'chat.refreshPreview': { en: 'Refresh preview', cn: '刷新预览' },
  'chat.appPreview': { en: 'App Preview', cn: '应用预览' },
  'chat.startingDevServer': { en: 'Starting dev server...', cn: '正在启动开发服务器...' },
  'chat.runningNpmInstall': { en: 'Running npm install & vite', cn: '正在运行 npm install 和 vite' },
  'chat.failedToStartPreview': { en: 'Failed to start preview', cn: '预览启动失败' },
  'chat.popOut': { en: 'Pop out', cn: '新窗口打开' },
  'chat.openInNewTab': { en: 'Open in new tab', cn: '在新标签页打开' },
  'chat.uploadToWorkspaceTitle': { en: 'Upload to Workspace', cn: '上传到工作区' },
  'chat.dragDropFiles': { en: 'Drag & drop files here, or', cn: '拖放文件到此处，或' },
  'chat.clickToBrowse': { en: 'click to browse', cn: '点击浏览' },
  'chat.fileTooLarge': { en: 'File exceeds 100MB limit:', cn: '文件超过 100MB 限制：' },
  'chat.cancel': { en: 'Cancel', cn: '取消' },
  'chat.loadingScopesEllipsis': { en: 'Loading scopes...', cn: '加载范围中...' },
  'chat.selectScopeLabel': { en: 'Select scope', cn: '选择范围' },
  'chat.noScopesAvailableMsg': { en: 'No scopes available', cn: '无可用范围' },
  'chat.loadingAgents': { en: 'Loading agents...', cn: '加载智能体中...' },
  'chat.autoAllAgents': { en: 'Auto (all agents)', cn: '自动（所有智能体）' },
  'chat.autoAllAgentsHint': { en: 'Let the scope route to the right agent', cn: '让范围自动路由到合适的智能体' },
  'chat.selectAgent': { en: 'Select agent', cn: '选择智能体' },
  'chat.scopeAgents': { en: 'Scope Agents', cn: '范围智能体' },
  'chat.createGroupChatRoom': { en: 'Create Group Chat Room', cn: '创建群聊房间' },
  'chat.createGroupChatDesc': { en: 'Create a room with multiple AI agents that can collaborate. Use @mention to talk to specific agents.', cn: '创建一个多智能体协作的房间。使用 @提及 与特定智能体对话。' },
  'chat.creating': { en: 'Creating...', cn: '创建中...' },
  'chat.createFromScope': { en: 'Create from current scope (all agents)', cn: '从当前范围创建（所有智能体）' },
  'chat.selectScopeFirst': { en: 'Select a business scope first to create a group chat room.', cn: '请先选择业务范围以创建群聊房间。' },

  // PublishToShowcaseModal
  'showcase.publishTitle': { en: 'Publish to Showcase', cn: '发布到明星案例' },
  'showcase.category': { en: 'Category', cn: '案例分类' },
  'showcase.noCategories': { en: 'No categories available. Please configure industries and domains in the admin panel.', cn: '暂无可用分类，请先在后台配置行业和领域。' },
  'showcase.caseName': { en: 'Case Name', cn: '案例名称' },
  'showcase.caseNamePlaceholder': { en: 'e.g. RDS Sysbench Performance Test', cn: '例如：RDS Sysbench 性能测试' },
  'showcase.briefDescription': { en: 'Brief Description', cn: '简要描述' },
  'showcase.briefDescPlaceholder': { en: 'Briefly describe what this case demonstrates...', cn: '简要描述这个案例展示了什么能力...' },
  'showcase.guidingPrompt': { en: 'Guiding Prompt', cn: '引导提示词' },
  'showcase.guidingPromptOptional': { en: 'optional', cn: '可选' },
  'showcase.guidingPromptPlaceholder': { en: 'The first message auto-sent when other users click Run...', cn: '其他用户点击 Run 时自动发送的第一条消息...' },
  'showcase.guidingPromptHint': { en: 'Leave empty to use description as the guiding prompt', cn: '留空则使用描述作为引导语' },
  'showcase.starOnly': { en: 'Star Only', cn: '仅收藏' },
  'showcase.publish': { en: 'Publish to Showcase', cn: '发布到明星案例' },
  'showcase.loadError': { en: 'Failed to load categories', cn: '无法加载案例分类' },
  'showcase.publishError': { en: 'Publish failed, please retry', cn: '发布失败，请重试' },

  // StarredSessions
  'starred.title': { en: 'Showcase', cn: '明星案例' },
  'starred.starred': { en: 'starred', cn: '已收藏' },
  'starred.searchPlaceholder': { en: 'Search starred sessions...', cn: '搜索收藏的会话...' },
  'starred.byScope': { en: 'By Scope', cn: '按范围' },
  'starred.byCategory': { en: 'By Category', cn: '按分类' },
  'starred.noStarred': { en: 'No starred sessions yet', cn: '暂无收藏的会话' },
  'starred.noStarredHint': { en: 'Star a chat session to save it as a showcase case.', cn: '收藏一个对话会话以保存为展示案例。' },
  'starred.uncategorized': { en: 'Uncategorized', cn: '未分类' },
  'starred.removeCategory': { en: 'Remove category', cn: '移除分类' },
  'starred.category.showcase': { en: 'Customer Demo', cn: '客户演示' },
  'starred.category.bestPractice': { en: 'Best Practice', cn: '最佳实践' },
  'starred.category.training': { en: 'Training Material', cn: '培训教材' },
  'starred.category.template': { en: 'Reusable Template', cn: '可复用模板' },

  // Projects page
  'projects.title': { en: 'Projects', cn: '项目' },
  'projects.newProject': { en: 'New Project', cn: '新建项目' },
  'projects.noProjects': { en: 'No projects yet', cn: '暂无项目' },
  'projects.noProjectsHint': { en: 'Create a project to start managing tasks with AI agents', cn: '创建项目以开始使用 AI 智能体管理任务' },
  'projects.issues': { en: 'issues', cn: '个问题' },
  'projects.deleteConfirm': { en: 'Delete this project and all its issues?', cn: '删除此项目及其所有问题？' },
  'projects.projectName': { en: 'Project name', cn: '项目名称' },
  'projects.descOptional': { en: 'Description (optional)', cn: '描述（可选）' },
  'projects.repoOptional': { en: 'Git repo URL (optional)', cn: 'Git 仓库 URL（可选）' },
  'projects.agentInCharge': { en: 'Agent in charge', cn: '负责智能体' },

  // KnowledgeManager
  'knowledge.titleRequired': { en: 'Document title is required', cn: '文档标题为必填项' },
  'knowledge.categoryRequired': { en: 'Category is required', cn: '分类为必填项' },
  'knowledge.fileRequired': { en: 'File is required', cn: '文件为必填项' },
  'knowledge.unsupportedType': { en: 'Unsupported file type. Supported: {types}', cn: '不支持的文件类型。支持：{types}' },
  'knowledge.fixErrors': { en: 'Please fix validation errors', cn: '请修正验证错误' },
  'knowledge.uploadSuccess': { en: 'Document uploaded successfully', cn: '文档上传成功' },
  'knowledge.uploadFailed': { en: 'Failed to upload document', cn: '文档上传失败' },
  'knowledge.deleteSuccess': { en: 'Document deleted successfully', cn: '文档删除成功' },
  'knowledge.deleteFailed': { en: 'Failed to delete document', cn: '文档删除失败' },
  'knowledge.syncSuccess': { en: 'All documents synced successfully', cn: '所有文档同步成功' },
  'knowledge.syncFailed': { en: 'Failed to sync documents', cn: '文档同步失败' },
  'knowledge.uploading': { en: 'Uploading...', cn: '上传中...' },
  'knowledge.clickToSelect': { en: 'Click to select file', cn: '点击选择文件' },
  'knowledge.titlePlaceholder': { en: 'e.g., Company Policies', cn: '例如：公司政策' },
  'knowledge.categoryPlaceholder': { en: 'e.g., HR, Technical, Product', cn: '例如：人力资源、技术、产品' },

  // Agents page
  'agents.createTeam': { en: 'Create Team', cn: '创建团队' },
  'agents.createAgent': { en: 'Create Agent', cn: '创建智能体' },

  // ShowcasePage residuals
  'showcase.view': { en: 'View', cn: '查看' },

  // ProjectBoard
  'project.aiTriage': { en: 'AI Triage', cn: 'AI 分诊' },
  'project.aiTriageHint': { en: 'AI analyzes all backlog issues and suggests priorities', cn: 'AI 分析所有待办问题并建议优先级' },
  'project.issueTitlePlaceholder': { en: 'Issue title...', cn: '问题标题...' },
  'project.startAgentExecution': { en: 'Start Agent Execution?', cn: '启动智能体执行？' },
  'project.movingToInProgress': { en: 'Moving', cn: '正在移动' },
  'project.toInProgress': { en: 'to In Progress.', cn: '到进行中。' },
  'project.agentWillCreateBranch': { en: 'The agent will create a branch, receive the issue description, and start coding.', cn: '智能体将创建分支、接收问题描述并开始编码。' },
  'project.justMove': { en: 'Just Move (no agent)', cn: '仅移动（不启动智能体）' },
  'project.startAgent': { en: 'Start Agent', cn: '启动智能体' },
  'project.refining': { en: 'Refining...', cn: '精炼中...' },
  'project.accept': { en: '✓ Accept', cn: '✓ 接受' },
  'project.discard': { en: '✕ Discard', cn: '✕ 放弃' },
  'project.before': { en: 'Before', cn: '修改前' },
  'project.afterRefined': { en: 'After (AI Refined)', cn: '修改后（AI 精炼）' },
  'project.empty': { en: '(empty)', cn: '（空）' },
  'project.changes': { en: 'Changes', cn: '变更' },
  'project.viewDiff': { en: 'View diff', cn: '查看差异' },
  'project.hideDiff': { en: 'Hide diff', cn: '隐藏差异' },
  'project.noDiffYet': { en: 'No diff data available yet. Diff is captured when the agent completes execution.', cn: '暂无差异数据。差异在智能体完成执行后捕获。' },
  'project.acceptanceCriteria': { en: 'Acceptance Criteria', cn: '验收标准' },
  'project.aiGenerated': { en: 'AI Generated', cn: 'AI 生成' },
  'project.relations': { en: 'Relations', cn: '关联' },
  'project.confirmed': { en: 'Confirmed', cn: '已确认' },
  'project.dismissed': { en: 'Dismissed', cn: '已忽略' },
  'project.viewAiReasoning': { en: 'View AI reasoning', cn: '查看 AI 推理' },
  'project.readinessScore': { en: 'Readiness Score', cn: '就绪评分' },
  'project.reanalyze': { en: 'Re-analyze', cn: '重新分析' },
  'project.consoleMessages': { en: 'messages', cn: '条消息' },
  'project.consoleExpand': { en: 'Expand', cn: '展开' },
  'project.consoleShrink': { en: 'Shrink', cn: '收起' },
  'project.consoleWaiting': { en: 'Waiting for agent activity...', cn: '等待智能体活动...' },
  'project.consoleNoSession': { en: 'No workspace session yet. Start a task to see agent output.', cn: '暂无工作区会话。启动任务以查看智能体输出。' },
  'project.aiTriageReport': { en: 'AI Triage Report', cn: 'AI 分诊报告' },
  'project.sprintCapacity': { en: 'Sprint capacity', cn: 'Sprint 容量' },
  'project.recommendedOrder': { en: '📋 Recommended Execution Order', cn: '📋 推荐执行顺序' },
  'project.mergeSuggestions': { en: '🔀 Merge Suggestions', cn: '🔀 合并建议' },
  'project.infoNeeded': { en: '❓ Information Needed', cn: '❓ 需要补充信息' },
  'project.riskFlags': { en: '🚩 Risk Flags', cn: '🚩 风险标记' },
  'project.conflictsWith': { en: 'Conflicts with', cn: '冲突' },
  'project.dependsOn': { en: 'Depends on', cn: '依赖' },
  'project.duplicatesOf': { en: 'Duplicates', cn: '重复' },
  'project.relatedTo': { en: 'Related to', cn: '相关' },
  'project.issueWorking': { en: 'Working...', cn: '处理中...' },
  'project.issueAnalyzing': { en: 'Analyzing...', cn: '分析中...' },

  // DigitalTwinWizard UI
  'twin.identitySubtitle': { en: 'Upload your photo and describe yourself', cn: '上传照片并描述自己' },
  'twin.photoLabel': { en: 'Photo', cn: '照片' },
  'twin.clickUploadPhoto': { en: 'Click to upload your photo', cn: '点击上传照片' },
  'twin.displayNameLabel': { en: 'Display Name', cn: '显示名称' },
  'twin.displayNamePlaceholder': { en: 'e.g. Yaohua', cn: '例如：耀华' },
  'twin.roleTitleLabel': { en: 'Role / Title', cn: '角色 / 职位' },
  'twin.rolePlaceholder': { en: 'e.g. AWS AgentCore Specialist', cn: '例如：AWS AgentCore 专家' },
  'twin.aboutYouLabel': { en: 'About You', cn: '关于你' },
  'twin.aboutYouPlaceholder': { en: 'Describe your expertise, personality, communication style... This will be used to generate your digital twin\'s behavior.', cn: '描述你的专业领域、个性、沟通风格……这将用于生成数字分身的行为。' },
  'twin.systemPromptLabel': { en: 'System Prompt', cn: '系统提示词' },
  'twin.aiGenerating': { en: 'Generating...', cn: '生成中...' },
  'twin.aiGenerateBtn': { en: 'AI Generate', cn: 'AI 生成' },
  'twin.systemPromptPlaceholder': { en: 'AI will generate this based on your description, or write your own...', cn: 'AI 将根据你的描述生成，或自行编写...' },
  'twin.knowledgeSubtitle': { en: 'Upload documents that represent your expertise', cn: '上传代表你专业知识的文档' },
  'twin.dropFilesUpload': { en: 'Drop files here or click to upload', cn: '拖放文件或点击上传' },
  'twin.fileFormats': { en: 'PDF, DOC, TXT, MD — up to 50MB each', cn: 'PDF、DOC、TXT、MD — 每个最大 50MB' },
  'twin.filesUploaded': { en: '{n} file(s) uploaded', cn: '已上传 {n} 个文件' },
  'twin.knowledgeTip': { en: 'Tip: Upload documents that contain your domain expertise — internal docs, guides, FAQs, meeting notes. Your digital twin will use these as reference when answering questions.', cn: '提示：上传包含你领域专业知识的文档——内部文档、指南、FAQ、会议记录。你的数字分身将在回答问题时参考这些内容。' },
  'twin.skillsSubtitle': { en: 'Choose whether AI should generate skills for your digital twin', cn: '选择是否让 AI 为你的数字分身生成技能' },
  'twin.skipSkillsLabel': { en: 'Skip skill generation', cn: '跳过技能生成' },
  'twin.skipSkillsHint': { en: 'You can open the Skill Workshop later to browse and equip skills, connect MCP servers, and fine-tune capabilities.', cn: '稍后可以打开技能工坊浏览和装备技能、连接 MCP 服务器并微调能力。' },
  'twin.generateSkillsHint': { en: 'During creation, AI will analyze your role and uploaded documents to generate 3–6 domain-specific skills. You can also add more skills later from the Skill Workshop.', cn: '创建过程中，AI 将分析你的角色和上传的文档，生成 3-6 个领域专属技能。稍后也可以从技能工坊添加更多技能。' },
  'twin.reviewSubtitle': { en: 'Review your digital twin and click Create', cn: '审核你的数字分身并点击创建' },
  'twin.summaryLabel': { en: 'Summary', cn: '摘要' },
  'twin.summaryLine': { en: '{docs} document(s) • {skills} • Platform', cn: '{docs} 个文档 • {skills} • 平台' },
  'twin.savingTwin': { en: 'Saving...', cn: '保存中...' },
  'twin.creatingTitle': { en: 'Creating {name}\'s Digital Twin', cn: '正在创建 {name} 的数字分身' },
  'twin.generatingConfig': { en: 'AI is generating your digital twin configuration...', cn: '正在生成数字分身配置...' },
  'twin.analyzingDocs': { en: 'AI is analyzing your documents and building skills...', cn: '正在分析文档并构建技能...' },
  'twin.userPrompt': { en: 'Create a digital twin for {name} ({role})', cn: '为 {name}（{role}）创建数字分身' },
  'twin.langDialogTitle': { en: 'Agent Language', cn: '智能体语言' },
  'twin.langDialogDesc': { en: 'Choose the language for the generated digital twin. This determines the language of the system prompt and skill descriptions.', cn: '选择生成数字分身的语言。这决定了系统提示词和技能描述的语言。' },
  'twin.langEnglish': { en: 'English', cn: 'English' },
  'twin.langCreateBtn': { en: 'Create', cn: '创建' },

  // CreateBusinessScope
  'scope.importTitle': { en: 'Import & Generate SOP', cn: '导入并生成 SOP' },
  'scope.importSubtitle': { en: 'Configure your business scope', cn: '配置你的业务范围' },
  'scope.selectUnit': { en: '1. Select Organizational Unit', cn: '1. 选择组织单元' },
  'scope.selectUnitDesc': { en: 'Choose the department this SOP belongs to for accurate generation context.', cn: '选择此 SOP 所属的部门以获得准确的生成上下文。' },
  'scope.customUnitName': { en: 'Custom Unit Name', cn: '自定义单元名称' },
  'scope.enterDeptName': { en: 'Enter department name...', cn: '输入部门名称...' },
  'scope.chooseStrategy': { en: '2. Choose Generation Strategy', cn: '2. 选择生成策略' },
  'scope.chooseStrategyDesc': { en: 'Select how you want the AI to construct your initial workflow draft.', cn: '选择你希望 AI 如何构建初始工作流草案。' },
  'scope.strategy1Title': { en: 'Generate Reference SOP using Agent', cn: '使用智能体生成参考 SOP' },
  'scope.strategy1Desc': { en: 'AI analyzes standard industry practices for your department to build a best-practice SOP.', cn: 'AI 分析你部门的行业标准实践，构建最佳实践 SOP。' },
  'scope.strategy2Title': { en: 'Import SOP document', cn: '导入 SOP 文档' },
  'scope.strategy2Desc': { en: 'Use LLM to understand existing SOP documents and automatically transform them into workflow nodes.', cn: '使用 LLM 理解现有 SOP 文档并自动转换为工作流节点。' },
  'scope.strategy3Title': { en: 'Build using Natural Language', cn: '使用自然语言构建' },
  'scope.strategy3Desc': { en: 'Describe your business in plain text and let AI create the scope and agents for you. Powered by Claude streaming analysis.', cn: '用自然语言描述你的业务，让 AI 为你创建范围和智能体。由 Claude 流式分析驱动。' },
  'scope.dragDropSop': { en: 'Drag & drop SOP document or click to browse', cn: '拖放 SOP 文档或点击浏览' },
  'scope.supportsPdf': { en: 'Supports PDF, DOCX, TXT', cn: '支持 PDF、DOCX、TXT' },
  'scope.selected': { en: 'Selected:', cn: '已选择：' },
  'scope.generateWithAi': { en: 'Generate with AI', cn: '使用 AI 生成' },
  'scope.nlPlaceholder': { en: "e.g. We're an e-commerce fashion brand with 50 employees. We need agents for customer support, inventory management, marketing campaigns, and order fulfillment...", cn: '例如：我们是一家拥有 50 名员工的电商时尚品牌。我们需要客户支持、库存管理、营销活动和订单履行的智能体...' },
  'scope.langDialogTitle': { en: 'Agent Language', cn: '智能体语言' },
  'scope.langDialogDesc': { en: 'Choose the language for the generated agents. This determines the language of agent names, system prompts, and skill descriptions.', cn: '选择生成智能体的语言。这决定了智能体名称、系统提示词和技能描述的语言。' },
  'scope.langEnglish': { en: 'English', cn: 'English' },
  'scope.langGenerate': { en: 'Generate', cn: '生成' },

  // AIScopeGenerator
  'aiScope.title': { en: 'AI Scope Generator', cn: 'AI 范围生成器' },
  'aiScope.describeTitle': { en: 'Describe your business', cn: '描述你的业务' },
  'aiScope.describeHint': { en: 'Tell us about your business, team, or use case. The AI will generate a scope with specialized agents.', cn: '告诉我们你的业务、团队或用例。AI 将生成具有专业智能体的范围。' },
  'aiScope.descPlaceholder': { en: "e.g. We're an e-commerce fashion brand with 50 employees. We need agents for customer support, inventory management, marketing campaigns, and order fulfillment...", cn: '例如：我们是一家拥有 50 名员工的电商时尚品牌。我们需要客户支持、库存管理、营销活动和订单履行的智能体...' },
  'aiScope.generate': { en: 'Generate', cn: '生成' },
  'aiScope.cancelGeneration': { en: 'Cancel generation', cn: '取消生成' },
  'aiScope.reviewTitle': { en: 'Review & Customize', cn: '审核并自定义' },
  'aiScope.reviewDesc': { en: 'Edit the scope and agents before saving. Click any card to edit.', cn: '保存前编辑范围和智能体。点击任意卡片编辑。' },
  'aiScope.agents': { en: 'Agents', cn: '智能体' },
  'aiScope.addAgent': { en: 'Add Agent', cn: '添加智能体' },
  'aiScope.startOver': { en: 'Start Over', cn: '重新开始' },
  'aiScope.createScope': { en: 'Create Scope', cn: '创建范围' },
  'aiScope.savingTitle': { en: 'Creating scope, agents & generating avatars...', cn: '正在创建范围、智能体并生成头像...' },
  'aiScope.savingHint': { en: 'This may take a moment while AI generates unique avatar images', cn: 'AI 正在生成独特的头像图片，请稍候' },
  'aiScope.errorTitle': { en: 'Generation Failed', cn: '生成失败' },
  'aiScope.tryAgain': { en: 'Try Again', cn: '重试' },
  'aiScope.editScope': { en: 'Edit Scope', cn: '编辑范围' },
  'aiScope.done': { en: 'Done', cn: '完成' },
  'aiScope.doneEditing': { en: 'Done editing', cn: '编辑完成' },

  // Tools page extras
  'tools.githubUrl': { en: 'GitHub URL', cn: 'GitHub URL' },
  'tools.uploadZipTab': { en: 'Upload Zip', cn: '上传 Zip' },
  'tools.githubHint': { en: 'Paste a GitHub link to check for SKILL.md files. Supports repo links, directory links, or direct file links.', cn: '粘贴 GitHub 链接以检查 SKILL.md 文件。支持仓库链接、目录链接或直接文件链接。' },
  'tools.check': { en: 'Check', cn: '检查' },
  'tools.noSkillMdFound': { en: 'No SKILL.md files found at this location.', cn: '此位置未找到 SKILL.md 文件。' },
  'tools.zipHint': { en: 'Upload a .zip or .tar.gz archive containing one or more SKILL.md files. Skills will be auto-detected and installed.', cn: '上传包含一个或多个 SKILL.md 文件的 .zip 或 .tar.gz 压缩包。技能将被自动检测并安装。' },
  'tools.dropZipHere': { en: 'Drop a .zip or .tar.gz file here, or click to browse', cn: '拖放 .zip 或 .tar.gz 文件，或点击浏览' },
  'tools.maxSize': { en: 'Max 20MB', cn: '最大 20MB' },
  'tools.uploadInstall': { en: 'Upload & Install', cn: '上传并安装' },
  'tools.processingFile': { en: 'Processing...', cn: '处理中...' },
  'tools.installingSkill': { en: 'Installing...', cn: '安装中...' },
  'tools.installed': { en: 'Installed', cn: '已安装' },
  'tools.install': { en: 'Install', cn: '安装' },
  'tools.noSkillMdArchive': { en: 'No SKILL.md files found in the archive.', cn: '压缩包中未找到 SKILL.md 文件。' },
  'tools.unsupportedArchive': { en: 'Only .zip, .tar.gz, and .tgz files are supported', cn: '仅支持 .zip、.tar.gz 和 .tgz 文件' },
  'tools.noMatchFilters': { en: 'No tools match your filters', cn: '没有匹配的工具' },
  'tools.noMarketResults': { en: 'No skills found for "{q}" on skills.sh', cn: '在 skills.sh 上未找到「{q}」的技能' },
  'tools.tryDifferent': { en: 'Try a different search term', cn: '尝试不同的搜索词' },
  'tools.tryAdjusting': { en: 'Try adjusting the category, source, or search query', cn: '尝试调整分类、来源或搜索词' },
  'tools.skill': { en: 'Skill', cn: '技能' },
  'tools.mcp': { en: 'MCP', cn: 'MCP' },
  'tools.plugin': { en: 'Plugin', cn: '插件' },

  // ============================================================================
  // Customer Service Module
  // ============================================================================
  'nav.support': { en: 'Support', cn: '客服' },
  'support.workspace': { en: 'Support Workspace', cn: '客服工作台' },
  'support.settings': { en: 'Support Settings', cn: '客服设置' },
  'support.analytics': { en: 'Support Analytics', cn: '客服分析' },
  'support.knowledge': { en: 'Knowledge Management', cn: '知识管理' },
  'support.conversations': { en: 'Conversations', cn: '对话' },
  'support.customers': { en: 'Customers', cn: '客户' },
  'support.faq': { en: 'FAQ', cn: 'FAQ' },
  'support.agentGroups': { en: 'Agent Groups', cn: '客服团队' },
  'support.escalationRules': { en: 'Escalation Rules', cn: '升级规则' },
  'support.responseTemplates': { en: 'Response Templates', cn: '快捷回复' },
  'support.businessHours': { en: 'Business Hours', cn: '工作时间' },
  'support.drafts': { en: 'FAQ Drafts', cn: 'FAQ 草稿' },
  'support.gaps': { en: 'Knowledge Gaps', cn: '知识盲区' },
  'support.autoLearn': { en: 'Auto-learn', cn: '自动学习' },
  'support.resolve': { en: 'Resolve', cn: '解决' },
  'support.close': { en: 'Close', cn: '关闭' },
  'support.handoff': { en: 'Transfer to Human', cn: '转人工' },
  'support.assign': { en: 'Assign', cn: '分配' },
  'support.allConversations': { en: 'All', cn: '全部' },
  'support.open': { en: 'Open', cn: '待处理' },
  'support.pendingAgent': { en: 'Pending Agent', cn: '等待人工' },
  'support.resolved': { en: 'Resolved', cn: '已解决' },
  'support.closed': { en: 'Closed', cn: '已关闭' },
  'support.noConversations': { en: 'No conversations', cn: '暂无对话' },
  'support.selectConversation': { en: 'Select a conversation to view details', cn: '选择一个对话查看详情' },
  'support.typeReply': { en: 'Type a reply...', cn: '输入回复...' },
  'support.send': { en: 'Send', cn: '发送' },
  'support.customer': { en: 'Customer', cn: '客户' },
  'support.agent': { en: 'Agent', cn: '客服' },
  'support.priority': { en: 'Priority', cn: '优先级' },
  'support.channel': { en: 'Channel', cn: '渠道' },
  'support.tags': { en: 'Tags', cn: '标签' },
  'support.notes': { en: 'Notes', cn: '备注' },
  'support.recentConversations': { en: 'Recent Conversations', cn: '最近对话' },
  'support.totalConversations': { en: 'Total Conversations', cn: '总对话数' },
  'support.aiResolvedRate': { en: 'AI Resolved Rate', cn: 'AI 解决率' },
  'support.avgCsat': { en: 'Avg CSAT Rating', cn: '平均满意度' },
  'support.resolutionRate': { en: 'Resolution Rate', cn: '解决率' },
  'support.last30Days': { en: 'Last 30 days', cn: '最近30天' },
  'support.generateGapReport': { en: 'Generate Gap Report', cn: '生成盲区报告' },
  'support.triggerDistill': { en: 'Trigger FAQ Distillation', cn: '触发FAQ提炼' },
  'support.distillComplete': { en: 'Distillation Complete', cn: '提炼完成' },
  'support.conversationsProcessed': { en: 'Conversations Processed', cn: '处理对话数' },
  'support.draftsCreated': { en: 'New Drafts Created', cn: '新建草稿数' },
  'support.publish': { en: 'Publish', cn: '发布' },
  'support.reject': { en: 'Reject', cn: '拒绝' },
  'support.noDrafts': { en: 'No FAQ drafts pending review', cn: '暂无待审核的FAQ草稿' },
  'support.problematicConversations': { en: 'Problematic Conversations', cn: '问题对话数' },
  'support.existingFaqs': { en: 'Existing FAQs', cn: '现有FAQ数' },
  'support.knowledgeGaps': { en: 'Knowledge Gaps', cn: '知识盲区数' },
  'support.routingStrategy': { en: 'Routing Strategy', cn: '路由策略' },
  'support.maxConcurrent': { en: 'Max Concurrent', cn: '最大并发' },
  'support.members': { en: 'Members', cn: '成员' },
  'support.active': { en: 'Active', cn: '活跃' },
  'support.inactive': { en: 'Inactive', cn: '未激活' },
  'support.offlineMessage': { en: 'Offline Message', cn: '离线消息' },
  'support.timezone': { en: 'Timezone', cn: '时区' },
  'support.shortcut': { en: 'Shortcut', cn: '快捷键' },
  'support.category': { en: 'Category', cn: '分类' },
  'support.conditions': { en: 'Conditions', cn: '触发条件' },
  'support.actions': { en: 'Actions', cn: '触发动作' },
  'support.rulePriority': { en: 'Rule Priority', cn: '规则优先级' }
}
