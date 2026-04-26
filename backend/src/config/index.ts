import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenvConfig();

const envSchema = z.object({
  // Server
  PORT: z.string().default('3000').transform(Number),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis Configuration
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().default('0').transform(Number),

  // Authentication
  AUTH_MODE: z.enum(['cognito', 'local']).default('local'),
  COGNITO_USER_POOL_ID: z.string().optional().default(''),
  COGNITO_CLIENT_ID: z.string().optional().default(''),
  COGNITO_REGION: z.string().default('us-east-1'),
  COGNITO_DOMAIN: z.string().optional(),

  // JWT secret for local auth mode
  JWT_SECRET: z.string().optional().default('super-agent-local-dev-secret-change-in-production'),

  // SMTP Configuration (for invite emails)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional().default('587').transform(Number),
  SMTP_SECURE: z.string().optional().default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional().default('noreply@super-agent.local'),
  APP_URL: z.string().optional().default('http://localhost:5173'),

  // Existing user binding — the Cognito sub that maps to the admin profile
  COGNITO_ADMIN_SUB: z.string().optional(),

  // AWS
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // Cognito-specific credentials (if the user pool is in a different AWS account)
  COGNITO_AWS_ACCESS_KEY_ID: z.string().optional(),
  COGNITO_AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // S3
  S3_BUCKET_NAME: z.string().default('super-agent-files'),
  S3_PRESIGNED_URL_EXPIRES: z.string().default('3600').transform(Number),
  SKILLS_S3_BUCKET: z.string().default('super-agent-skills'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // CORS
  // Supports '*' for all origins (development) or comma-separated list of allowed origins (production)
  // Example: 'https://app.example.com,https://admin.example.com'
  CORS_ORIGIN: z.string().default('*'),

  // Claude Agent SDK
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_CODE_USE_BEDROCK: z.string().optional().default('false'),
  CLAUDE_MODEL: z.string().optional().default('claude-sonnet-4-5-20250929'),
  // Separate Bedrock credentials — only injected into the SDK subprocess,
  // so the main process keeps using the EC2 instance role for S3/Secrets/etc.
  BEDROCK_AWS_ACCESS_KEY_ID: z.string().optional(),
  BEDROCK_AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AGENT_WORKSPACE_BASE_DIR: z.string().optional().default('/tmp/workspaces'),
  CLAUDE_CODE_EXECUTABLE: z.string().optional(),
  CLAUDE_SESSION_TIMEOUT_MS: z.string().optional().default('1800000').transform(Number), // 30 min
  CLAUDE_RESPONSE_TIMEOUT_MS: z.string().optional().default('1200000').transform(Number), // 20 min
  CLAUDE_MAX_CONCURRENT_SESSIONS: z.string().optional().default('10').transform(Number),

  // Document Groups
  DOC_GROUPS_BASE_PATH: z.string().optional().default('/tmp/super-agent-doc-groups'),

  // Langfuse Observability
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().optional(),

  // AgentCore Runtime (container-isolated agent execution)
  AGENTCORE_RUNTIME_ARN: z.string().optional(),
  AGENTCORE_BASE_IMAGE: z.string().optional(),
  AGENTCORE_EXECUTION_ROLE_ARN: z.string().optional(),
  AGENTCORE_BACKEND_API_URL: z.string().optional(),
  AGENTCORE_BACKEND_API_KEY: z.string().optional(),
  AGENTCORE_WORKSPACE_S3_BUCKET: z.string().optional().default('super-agent-workspaces'),

  // LiteLLM Proxy (for model listing and routing)
  LITELLM_BASE_URL: z.string().optional(),
  LITELLM_API_KEY: z.string().optional(),

  // Agent Runtime selection: "claude" (default), "agentcore", or "openclaw"
  AGENT_RUNTIME: z.enum(['claude', 'agentcore', 'openclaw']).optional().default('claude'),

  // Process role: controls which components start in this process.
  // "all" (default) = API + workers + gateways (single-process, local dev / EC2)
  // "api" = HTTP server only (no BullMQ workers, no schedulers, no IM gateways)
  // "worker" = BullMQ workers + schedulers only (no HTTP routes)
  // "gateway" = IM long-lived connections only
  PROCESS_ROLE: z.enum(['all', 'api', 'worker', 'gateway']).optional().default('all'),

  // OpenClaw on AgentCore (when AGENT_RUNTIME=openclaw)
  OPENCLAW_AGENTCORE_RUNTIME_ARN: z.string().optional(),

  // Vector Memory (optional — pgvector + Bedrock Nova Embed semantic memory layer)
  VECTOR_MEMORY_ENABLED: z.string().optional(),

  // RAG (optional — semantic document search over knowledge base)
  RAG_ENABLED: z.string().optional(),

  // Data Connector OAuth (Google, Salesforce, etc.)
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  SALESFORCE_OAUTH_CLIENT_ID: z.string().optional(),
  SALESFORCE_OAUTH_CLIENT_SECRET: z.string().optional(),
  OAUTH_REDIRECT_BASE_URL: z.string().optional(), // e.g. https://app.example.com
});

function loadConfig(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    throw new Error('Invalid environment configuration');
  }

  return result.data;
}

const env = loadConfig();

export const config = {
  port: env.PORT,
  host: env.HOST,
  nodeEnv: env.NODE_ENV,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
  },

  authMode: env.AUTH_MODE,

  cognito: {
    userPoolId: env.COGNITO_USER_POOL_ID,
    clientId: env.COGNITO_CLIENT_ID,
    region: env.COGNITO_REGION,
    domain: env.COGNITO_DOMAIN,
    adminSub: env.COGNITO_ADMIN_SUB,
  },

  jwtSecret: env.JWT_SECRET,

  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
    enabled: !!env.SMTP_HOST,
  },

  appUrl: env.APP_URL,

  aws: {
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },

  cognitoCredentials: {
    // Falls back to general AWS credentials if not separately configured
    accessKeyId: env.COGNITO_AWS_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.COGNITO_AWS_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY,
  },

  s3: {
    bucketName: env.S3_BUCKET_NAME,
    presignedUrlExpires: env.S3_PRESIGNED_URL_EXPIRES,
    skillsBucket: env.SKILLS_S3_BUCKET,
  },

  claude: {
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    useBedrock: env.CLAUDE_CODE_USE_BEDROCK === 'true' || env.CLAUDE_CODE_USE_BEDROCK === '1',
    model: env.CLAUDE_MODEL,
    bedrockAccessKeyId: env.BEDROCK_AWS_ACCESS_KEY_ID,
    bedrockSecretAccessKey: env.BEDROCK_AWS_SECRET_ACCESS_KEY,
    workspaceBaseDir: env.AGENT_WORKSPACE_BASE_DIR,
    executablePath: env.CLAUDE_CODE_EXECUTABLE,
    sessionTimeoutMs: env.CLAUDE_SESSION_TIMEOUT_MS,
    responseTimeoutMs: env.CLAUDE_RESPONSE_TIMEOUT_MS,
    maxConcurrentSessions: env.CLAUDE_MAX_CONCURRENT_SESSIONS,
  },

  docGroups: {
    basePath: env.DOC_GROUPS_BASE_PATH,
  },

  langfuse: {
    secretKey: env.LANGFUSE_SECRET_KEY,
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    baseUrl: env.LANGFUSE_BASE_URL,
    enabled: !!(env.LANGFUSE_SECRET_KEY && env.LANGFUSE_PUBLIC_KEY),
  },

  agentcore: {
    runtimeArn: env.AGENTCORE_RUNTIME_ARN,
    baseImage: env.AGENTCORE_BASE_IMAGE,
    executionRoleArn: env.AGENTCORE_EXECUTION_ROLE_ARN,
    backendApiUrl: env.AGENTCORE_BACKEND_API_URL,
    backendApiKey: env.AGENTCORE_BACKEND_API_KEY,
    workspaceS3Bucket: env.AGENTCORE_WORKSPACE_S3_BUCKET,
    region: env.AWS_REGION,
  },

  litellm: {
    baseUrl: env.LITELLM_BASE_URL,
    apiKey: env.LITELLM_API_KEY,
  },

  agentRuntime: env.AGENT_RUNTIME,
  processRole: env.PROCESS_ROLE,

  openclaw: {
    agentCoreRuntimeArn: env.OPENCLAW_AGENTCORE_RUNTIME_ARN,
  },

  vectorMemory: {
    enabled: env.VECTOR_MEMORY_ENABLED === 'true' || env.VECTOR_MEMORY_ENABLED === '1',
  },

  rag: {
    enabled: env.RAG_ENABLED === 'true' || env.RAG_ENABLED === '1',
  },

  connectorOAuth: {
    google: {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    },
    salesforce: {
      clientId: env.SALESFORCE_OAUTH_CLIENT_ID ?? '',
      clientSecret: env.SALESFORCE_OAUTH_CLIENT_SECRET ?? '',
    },
    redirectBaseUrl: env.OAUTH_REDIRECT_BASE_URL ?? `http://localhost:${env.PORT}`,
  },

  logLevel: env.LOG_LEVEL,
  corsOrigin: env.CORS_ORIGIN,
} as const;

export type Config = typeof config;
