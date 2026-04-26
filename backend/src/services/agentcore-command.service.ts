/**
 * AgentCore Command Service
 *
 * Wraps InvokeAgentRuntimeCommandCommand to execute shell commands directly
 * inside AgentCore Runtime containers without going through LLM.
 *
 * Used by Chat module workspace operations (file tree, file read/write/delete)
 * when AGENT_RUNTIME=agentcore.
 *
 * Key constraints:
 *   - Commands must be wrapped in `/bin/bash -c "..."` for shell features
 *   - Session must already exist (created via InvokeAgentRuntime)
 *   - Command body max 64KB, timeout 1-3600s
 *   - Each command is a fresh bash process (stateless between calls)
 */

import { config } from '../config/index.js';

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  status: 'COMPLETED' | 'TIMED_OUT' | null;
}

export class AgentCoreCommandService {
  private client: any;
  private CommandClass: any;
  private sdkLoaded = false;

  private async ensureSDK(): Promise<void> {
    if (this.sdkLoaded) return;
    const mod = await import('@aws-sdk/client-bedrock-agentcore' as string);
    const arnRegion = config.agentcore.runtimeArn?.split(':')[3];
    const region = arnRegion || config.agentcore.region;
    this.client = new mod.BedrockAgentCoreClient({ region });
    this.CommandClass = mod.InvokeAgentRuntimeCommandCommand;
    this.sdkLoaded = true;
  }

  private get runtimeArn(): string {
    const arn = config.agentcore.runtimeArn;
    if (!arn) throw new Error('AGENTCORE_RUNTIME_ARN is not configured');
    return arn;
  }

  /**
   * Execute a shell command inside the AgentCore container.
   * The command is automatically wrapped in `/bin/bash -c "..."`.
   */
  async runCommand(
    sessionId: string,
    command: string,
    timeout = 60,
  ): Promise<CommandResult> {
    await this.ensureSDK();

    // Pad session ID to meet 33-char minimum
    const sid = sessionId.length >= 33 ? sessionId : sessionId.padEnd(33, '_');

    const response = await this.client.send(new this.CommandClass({
      agentRuntimeArn: this.runtimeArn,
      runtimeSessionId: sid,
      contentType: 'application/json',
      accept: 'application/vnd.amazon.eventstream',
      body: {
        command: `/bin/bash -c ${this.shellEscape(command)}`,
        timeout,
      },
    }));

    let stdout = '';
    let stderr = '';
    let exitCode: number | null = null;
    let status: 'COMPLETED' | 'TIMED_OUT' | null = null;

    for await (const event of response.stream) {
      if (event.chunk?.contentDelta?.stdout) {
        stdout += event.chunk.contentDelta.stdout;
      }
      if (event.chunk?.contentDelta?.stderr) {
        stderr += event.chunk.contentDelta.stderr;
      }
      if (event.chunk?.contentStop) {
        exitCode = event.chunk.contentStop.exitCode;
        status = event.chunk.contentStop.status;
      }
    }

    return { stdout, stderr, exitCode, status };
  }

  // ---------------------------------------------------------------------------
  // Workspace operations (convenience wrappers)
  // ---------------------------------------------------------------------------

  /** List files in /workspace as a tree structure. */
  async listWorkspaceFiles(sessionId: string): Promise<WorkspaceFileEntry[]> {
    const { stdout, exitCode } = await this.runCommand(
      sessionId,
      "find /workspace -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/__pycache__/*' -not -path '*/dist/*' -printf '%y %s %P\\n' 2>/dev/null | sort",
    );

    if (exitCode !== 0 || !stdout.trim()) return [];

    return stdout.trim().split('\n').filter(Boolean).map(line => {
      const [type, sizeStr, ...pathParts] = line.split(' ');
      const path = pathParts.join(' ');
      return {
        type: type === 'd' ? 'directory' as const : 'file' as const,
        size: parseInt(sizeStr ?? '0', 10),
        path,
      };
    }).filter(e => e.path); // filter out empty root entry
  }

  /** Read a file from /workspace. Returns null if not found. */
  async readFile(sessionId: string, filePath: string): Promise<string | null> {
    const safe = this.sanitizePath(filePath);
    if (!safe) return null;

    const { stdout, exitCode } = await this.runCommand(
      sessionId,
      `cat /workspace/${safe}`,
    );

    return exitCode === 0 ? stdout : null;
  }

  /** Write content to a file in /workspace. */
  async writeFile(sessionId: string, filePath: string, content: string): Promise<boolean> {
    const safe = this.sanitizePath(filePath);
    if (!safe) return false;

    // Use heredoc to avoid escaping issues
    const { exitCode } = await this.runCommand(
      sessionId,
      `mkdir -p /workspace/$(dirname ${safe}) && cat > /workspace/${safe} << 'AGENTCORE_HEREDOC_EOF'\n${content}\nAGENTCORE_HEREDOC_EOF`,
    );

    return exitCode === 0;
  }

  /** Delete a file from /workspace. */
  async deleteFile(sessionId: string, filePath: string): Promise<boolean> {
    const safe = this.sanitizePath(filePath);
    if (!safe) return false;

    const { exitCode } = await this.runCommand(
      sessionId,
      `rm -f /workspace/${safe}`,
    );

    return exitCode === 0;
  }

  /** Delete a directory from /workspace. */
  async deleteDirectory(sessionId: string, dirPath: string): Promise<boolean> {
    const safe = this.sanitizePath(dirPath);
    if (!safe) return false;

    const { exitCode } = await this.runCommand(
      sessionId,
      `rm -rf /workspace/${safe}`,
    );

    return exitCode === 0;
  }

  /**
   * Pull a file from S3 into the running container's /workspace.
   * Uses the AWS CLI inside the container to download the file directly,
   * avoiding base64/heredoc size limits.
   */
  async syncFileFromS3(
    sessionId: string,
    bucket: string,
    s3Key: string,
    workspaceRelativePath: string,
  ): Promise<boolean> {
    const safe = this.sanitizePath(workspaceRelativePath);
    if (!safe) return false;

    // Use a node script to download from S3 — the container has node +
    // @aws-sdk/client-s3 installed. The container uses ESM ("type":"module")
    // so we use dynamic import() and --input-type=module.
    // The container's WORKSPACE_S3_REGION env var is used for the S3 client
    // region (may differ from the Bedrock region in AWS_REGION).
    const script = [
      `mkdir -p /workspace/$(dirname '${safe}')`,
      `&&`,
      `node --input-type=module -e "`,
      `import{S3Client,GetObjectCommand}from'@aws-sdk/client-s3';`,
      `import{createWriteStream}from'fs';`,
      `import{pipeline}from'stream/promises';`,
      `const s3=new S3Client({region:process.env.WORKSPACE_S3_REGION||'us-east-1'});`,
      `const r=await s3.send(new GetObjectCommand({Bucket:'${bucket}',Key:'${s3Key}'}));`,
      `await pipeline(r.Body,createWriteStream('/workspace/${safe}'));`,
      `console.log('OK');`,
      `"`,
    ].join(' ');

    const { exitCode, stderr } = await this.runCommand(sessionId, script, 120);

    if (exitCode !== 0) {
      console.warn(`[agentcore-cmd] syncFileFromS3 failed for ${safe}:`, stderr);
    }

    return exitCode === 0;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Sanitize a workspace-relative path to prevent traversal attacks. */
  private sanitizePath(filePath: string): string | null {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.includes('..') || normalized.startsWith('/')) return null;
    // Remove any shell-dangerous characters
    if (/[`$;|&<>]/.test(normalized)) return null;
    return normalized;
  }

  /** Escape a string for use as a bash -c argument. */
  private shellEscape(cmd: string): string {
    // Use $'...' syntax with escaped single quotes
    return `$'${cmd.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
}

interface WorkspaceFileEntry {
  type: 'file' | 'directory';
  size: number;
  path: string;
}

export const agentCoreCommandService = new AgentCoreCommandService();
