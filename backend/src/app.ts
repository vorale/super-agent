import Fastify, { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { createWriteStream } from 'node:fs';
import { config } from './config/index.js';

// Tee console output to a log file
const logFile = createWriteStream('backend.log', { flags: 'a' });
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;
console.log = (...args: unknown[]) => { origLog(...args); logFile.write(`[LOG ${new Date().toISOString()}] ${args.map(String).join(' ')}\n`); };
console.error = (...args: unknown[]) => { origError(...args); logFile.write(`[ERR ${new Date().toISOString()}] ${args.map(String).join(' ')}\n`); };
console.warn = (...args: unknown[]) => { origWarn(...args); logFile.write(`[WRN ${new Date().toISOString()}] ${args.map(String).join(' ')}\n`); };
import { errorHandler, registerRequestLogger } from './middleware/index.js';
import { registerRoutes } from './routes/index.js';
import { executionWebSocketGateway } from './websocket/index.js';
import { initializeEventWebSocketBridge, initializeWorkflowQueues } from './setup/index.js';
import { startScheduleProcessor, stopScheduleProcessor } from './setup/index.js';
import { startProjectAutoProcessor, stopProjectAutoProcessor } from './setup/index.js';
import { claudeAgentService } from './services/claude-agent.service.js';
import { devServerManager } from './services/dev-server-manager.js';
import { workspaceManager } from './services/workspace-manager.js';
import { shutdownLangfuse } from './services/langfuse.service.js';
import { briefingScheduler } from './services/briefing-scheduler.service.js';
import { imService } from './services/im.service.js';
import { imQueueService } from './services/im-queue.service.js';
import { distillationService } from './services/distillation.service.js';
import { redisService } from './services/redis.service.js';

export async function buildApp(): Promise<FastifyInstance> {
  // Configure logger based on environment
  const loggerConfig =
    config.nodeEnv === 'development'
      ? {
          level: config.logLevel,
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
              colorize: true,
            },
          },
        }
      : {
          // Production: structured JSON output
          level: config.logLevel,
          // Redact sensitive fields
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        };

  const app = Fastify({
    logger: loggerConfig,
    genReqId: () => crypto.randomUUID(),
    // Disable default request logging (we use custom hooks)
    disableRequestLogging: true,
    // Increase body limit to 200MB to support large file uploads (base64-encoded
    // 100MB file → ~134MB base64 payload, plus JSON overhead)
    bodyLimit: 200 * 1024 * 1024, // 200MB
  });

  // Register global error handler
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    errorHandler(error, request, reply);
  });

  // Register request logging hooks
  registerRequestLogger(app);

  // Register CORS for frontend access
  // Requirements: 1.3
  // Supports configurable origins via CORS_ORIGIN environment variable
  // In production, set CORS_ORIGIN to specific frontend domains
  await app.register(cors, {
    origin:
      config.corsOrigin === '*'
        ? true // Allow all origins in development
        : config.corsOrigin.split(',').map((o) => o.trim()), // Support comma-separated origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: [
      'Content-Disposition', // For file downloads
      'Content-Type',        // For binary file responses (images, etc.)
      'Content-Length',      // For progress tracking
      'X-Request-Id', // For request tracing
    ],
    maxAge: 86400, // Cache preflight requests for 24 hours
  });

  // Register multipart support for file uploads (SOP documents, etc.)
  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB max file size
      files: 1, // single file per request
    },
  });

  // Register Swagger for API documentation
  // Requirements: 14.1, 14.2, 14.3
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Super Agent Backend API',
        description:
          'Unified backend API for Super Agent Platform. This API provides endpoints for managing agents, tasks, workflows, documents, chat sessions, MCP servers, organizations, and business scopes.',
        version: '1.0.0',
        contact: {
          name: 'Super Agent Platform Team',
        },
        license: {
          name: 'ISC',
        },
      },
      servers: [
        {
          url: `http://${config.host}:${config.port}`,
          description: 'Development server',
        },
      ],
      tags: [
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Agents', description: 'Agent management endpoints' },
        { name: 'Tasks', description: 'Task management endpoints' },
        { name: 'Workflows', description: 'Workflow management endpoints' },
        { name: 'Documents', description: 'Document management endpoints' },
        { name: 'Files', description: 'File storage endpoints' },
        { name: 'Chat', description: 'Chat and streaming endpoints' },
        { name: 'MCP', description: 'MCP server configuration endpoints' },
        { name: 'Organizations', description: 'Organization management endpoints' },
        { name: 'Memberships', description: 'Membership management endpoints' },
        { name: 'Business Scopes', description: 'Business scope management endpoints' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'JWT authentication token. Include in Authorization header as: Bearer <token>',
          },
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              error: { type: 'string', description: 'Human-readable error message' },
              code: { type: 'string', description: 'Machine-readable error code' },
              details: {
                type: 'array',
                description: 'Additional error details (validation errors, etc.)',
                items: { type: 'object' },
              },
              requestId: { type: 'string', description: 'Request ID for tracing' },
            },
            required: ['error', 'code', 'requestId'],
          },
          Pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer', description: 'Current page number' },
              limit: { type: 'integer', description: 'Items per page' },
              total: { type: 'integer', description: 'Total number of items' },
              totalPages: { type: 'integer', description: 'Total number of pages' },
            },
          },
        },
      },
      externalDocs: {
        description: 'Super Agent Platform Documentation',
        url: 'https://github.com/super-agent/docs',
      },
    },
  });

  // Register Swagger UI at /docs endpoint
  // Requirements: 14.2
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // Register API routes (includes health routes)
  await registerRoutes(app);

  // Register WebSocket gateway for real-time workflow execution events
  // Requirements: 5.1, 5.4 - Real-time status updates
  await executionWebSocketGateway.register(app);

  // Initialize the event-websocket bridge to forward workflow events to WebSocket clients
  // Requirements: 5.1 - WHEN a node's status changes, emit a Workflow_Event to all subscribed clients
  initializeEventWebSocketBridge();

  const role = config.processRole; // 'all' | 'api' | 'worker' | 'gateway'

  // ── BullMQ Workers + Schedulers (worker + all) ──
  if (role === 'worker' || role === 'all') {
    // Initialize workflow queues and processors for BullMQ job processing
    await initializeWorkflowQueues();

    // Start briefing generation scheduler (runs every 5 minutes)
    briefingScheduler.start();

    // Start schedule processor for cron-based workflow triggers (polls every 15s)
    startScheduleProcessor();

    // Start project auto-processor for kanban board automation (polls every 15s)
    startProjectAutoProcessor();

    // Initialize IM message queue worker
    await imQueueService.initialize();

    // Initialize distillation queue worker for memory extraction
    await distillationService.initialize();

    // Periodic workspace pruning (every hour)
    const workspacePruneInterval = setInterval(async () => {
      try {
        const removed = await workspaceManager.pruneStaleWorkspaces();
        if (removed > 0) app.log.info(`Pruned ${removed} stale workspace(s)`);
      } catch (err) {
        app.log.error({ err }, 'Workspace pruning failed');
      }
    }, 60 * 60 * 1000);
    if (workspacePruneInterval.unref) workspacePruneInterval.unref();

    app.addHook('onClose', async () => {
      clearInterval(workspacePruneInterval);
      briefingScheduler.stop();
      stopScheduleProcessor();
      stopProjectAutoProcessor();
      await imQueueService.shutdown();
      await distillationService.shutdown();
    });
  }

  // ── API-side queue initialization (api + all) ──
  // API needs Queue instances (for enqueue) but NOT Workers
  if (role === 'api') {
    await redisService.initialize();
    // Distillation: only init queue (no worker) so chat.service can enqueue
    await distillationService.initializeQueue();
  }

  // ── IM Gateways (gateway + all) ──
  if (role === 'gateway' || role === 'all') {
    imService.startGateways().catch((err) => {
      app.log.error({ err }, 'Failed to start IM gateways');
    });

    app.addHook('onClose', async () => {
      app.log.info('Stopping IM gateways...');
      await imService.stopGateways();
    });
  }

  // ── Claude session management (api + all — needs to be co-located with HTTP) ──
  if (role === 'api' || role === 'all') {
    claudeAgentService.startCleanupTimer();
  }

  // ── Graceful shutdown for Claude sessions (api + all) ──
  app.addHook('onClose', async (_instance) => {
    app.log.info('Server shutting down — disconnecting all Claude Agent SDK sessions...');
    try {
      const count = await claudeAgentService.disconnectAll();
      app.log.info(`Graceful shutdown complete: cleaned up ${count} Claude session(s)`);
      const devCount = devServerManager.stopAll();
      if (devCount > 0) app.log.info(`Stopped ${devCount} dev server(s)`);
      await shutdownLangfuse();
      app.log.info('Langfuse client shut down');
    } catch (error) {
      app.log.error(
        { err: error },
        'Error during Claude Agent SDK graceful shutdown',
      );
    }
  });

  return app;
}
