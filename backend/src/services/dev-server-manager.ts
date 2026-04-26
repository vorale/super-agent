/**
 * DevServerManager — manages Vite dev servers for chat session app previews.
 *
 * Each session can have at most one dev server. The manager:
 * - Runs `npm install` if node_modules is missing
 * - Spawns `npx vite --port {port}` in the session workspace
 * - Tracks port assignments and auto-kills idle servers
 */

import { ChildProcess, spawn } from 'child_process';
import { access } from 'fs/promises';
import { join } from 'path';
import { createServer } from 'net';
import { findAppRoot } from './app-finder.js';

interface DevServer {
  process: ChildProcess;
  port: number;
  sessionId: string;
  workspacePath: string;
  lastAccess: number;
  ready: boolean;
}

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const PORT_RANGE_START = 15000;
const PORT_RANGE_END = 16000;

class DevServerManager {
  private servers = new Map<string, DevServer>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => this.pruneIdle(), 60_000);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  /** Get or start a dev server for a session. Returns the port. */
  async ensureDevServer(sessionId: string, workspacePath: string): Promise<number> {
    const existing = this.servers.get(sessionId);
    if (existing) {
      existing.lastAccess = Date.now();
      return existing.port;
    }

    // Intelligently find the actual app root within the workspace.
    // This handles cases where the agent created the app in a nested subfolder
    // (e.g. todo-app/todo-app/) due to path confusion from guardrails.
    const appCandidate = await findAppRoot(workspacePath);
    const appRoot = appCandidate.path;
    console.log(`[DevServerManager] App root for session ${sessionId}: ${appCandidate.relativePath} (score: ${appCandidate.score}, reason: ${appCandidate.reason})`);

    // Check if package.json exists in the resolved app root
    const pkgPath = join(appRoot, 'package.json');
    try {
      await access(pkgPath);
    } catch {
      throw new Error(`No package.json found in workspace (searched: ${appCandidate.relativePath})`);
    }

    // npm install if needed.
    // Check for node_modules/.package-lock.json as a more reliable indicator
    // that npm install has completed (an empty node_modules dir can exist from
    // S3 sync or partial installs).
    const nmPath = join(appRoot, 'node_modules');
    const nmLockPath = join(appRoot, 'node_modules', '.package-lock.json');
    let needsInstall = false;
    try {
      await access(nmLockPath);
    } catch {
      needsInstall = true;
    }

    if (needsInstall) {
      console.log(`[DevServerManager] Running npm install in ${appRoot}`);
      await this.runCommand('npm', ['install'], appRoot, { NODE_ENV: 'development' });
    }

    const port = await this.findFreePort();

    const proc = spawn('npx', ['vite', '--port', String(port), '--host', '0.0.0.0', '--strictPort'], {
      cwd: appRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
    });

    const server: DevServer = {
      process: proc,
      port,
      sessionId,
      workspacePath,
      lastAccess: Date.now(),
      ready: false,
    };

    this.servers.set(sessionId, server);

    // Wait for vite to be ready (listen for "ready in" or "Local:" in stdout)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(); // resolve anyway after timeout, vite might still be starting
      }, 15_000);

      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes('Local:') || text.includes('ready in')) {
          server.ready = true;
          clearTimeout(timeout);
          proc.stdout?.off('data', onData);
          resolve();
        }
      };

      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        // Log errors but don't fail — vite warnings go to stderr
        if (text.includes('Error') || text.includes('EADDRINUSE')) {
          clearTimeout(timeout);
          this.servers.delete(sessionId);
          reject(new Error(`Vite failed to start: ${text.slice(0, 200)}`));
        }
      });

      proc.on('exit', (code) => {
        clearTimeout(timeout);
        this.servers.delete(sessionId);
        if (!server.ready) {
          reject(new Error(`Vite exited with code ${code}`));
        }
      });
    });

    return port;
  }

  /** Get the port for an existing dev server, or null. */
  getPort(sessionId: string): number | null {
    const server = this.servers.get(sessionId);
    if (server) {
      server.lastAccess = Date.now();
      return server.port;
    }
    return null;
  }

  /** Stop a specific session's dev server. */
  stop(sessionId: string): void {
    const server = this.servers.get(sessionId);
    if (server) {
      server.process.kill('SIGTERM');
      this.servers.delete(sessionId);
    }
  }

  /** Stop all dev servers (for graceful shutdown). */
  stopAll(): number {
    let count = 0;
    for (const [id, server] of this.servers) {
      server.process.kill('SIGTERM');
      this.servers.delete(id);
      count++;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    return count;
  }

  /** Kill idle servers. */
  private pruneIdle(): void {
    const now = Date.now();
    for (const [id, server] of this.servers) {
      if (now - server.lastAccess > IDLE_TIMEOUT_MS) {
        server.process.kill('SIGTERM');
        this.servers.delete(id);
      }
    }
  }

  private async findFreePort(): Promise<number> {
    // Try random ports in range until one is free
    for (let attempt = 0; attempt < 50; attempt++) {
      const port = PORT_RANGE_START + Math.floor(Math.random() * (PORT_RANGE_END - PORT_RANGE_START));
      const inUse = [...this.servers.values()].some(s => s.port === port);
      if (inUse) continue;
      const free = await this.isPortFree(port);
      if (free) return port;
    }
    throw new Error('No free port found for dev server');
  }

  private isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const srv = createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => { srv.close(() => resolve(true)); });
      srv.listen(port, '0.0.0.0');
    });
  }

  private runCommand(cmd: string, args: string[], cwd: string, envOverrides?: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, {
        cwd,
        stdio: 'pipe',
        env: envOverrides ? { ...process.env, ...envOverrides } : undefined,
      });
      let stderr = '';
      proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}${stderr ? ': ' + stderr.slice(0, 500) : ''}`));
      });
      proc.on('error', reject);
    });
  }
}

export const devServerManager = new DevServerManager();
