/**
 * Workspace Manager
 * Manages per-session isolated workspace directories following the canonical
 * Claude Code workspace structure:
 *
 *   {baseDir}/{orgId}/{scopeId}/sessions/{sessionId}/
 *     CLAUDE.md
 *     .claude/
 *       settings.json
 *       skills/{name}/SKILL.md
 *       agents/{name}.md
 *
 * Supports config-version-based lazy refresh so active sessions pick up
 * scope/agent/skill changes on the next conversation turn.
 */

import { mkdir, rm, readFile, writeFile, access, readdir, stat, cp, symlink } from 'fs/promises';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { config } from '../config/index.js';

// Built-in skills directory: backend/skills/
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUILTIN_SKILLS_DIR = join(__dirname, '..', '..', 'skills');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Skill info needed for workspace setup (camelCase). */
export interface WorkspaceFileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: WorkspaceFileNode[];
}

/** Skill info needed for workspace setup (camelCase). */
export interface SkillForWorkspace {
  id: string;
  name: string;
  hashId: string;
  s3Bucket: string;
  s3Prefix: string;
  /** Local path for marketplace-installed skills (takes precedence over S3) */
  localPath?: string;
  /** Inline skill body for generated skills (fallback when S3 has no content) */
  description?: string;
  body?: string;
}

/** MCP server info needed for workspace settings.json generation. */
export interface McpServerForWorkspace {
  name: string;
  hostAddress: string;
  /** Optional env vars to pass to stdio servers */
  env?: Record<string, string>;
  /** Structured SDK config (takes precedence over hostAddress parsing) */
  config?: Record<string, unknown> | null;
}

/** Plugin info needed for workspace provisioning. */
export interface PluginForWorkspace {
  name: string;
  gitUrl: string;
  ref: string;
}

/** Agent info needed for subagent file generation. */
export interface AgentForWorkspace {
  id: string;
  name: string;
  displayName: string;
  role: string | null;
  systemPrompt: string | null;
  skillNames: string[];
  /** Avatar S3 key or URL (used for speaker annotation in SSE). */
  avatar?: string | null;
  generatedSkills?: Array<{ name: string; description: string; body: string }>;
}

/** Business scope info needed for workspace provisioning. */
export interface ScopeForWorkspace {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  settings?: Record<string, unknown> | null;
  configVersion: number;
  agents: AgentForWorkspace[];
  skills: SkillForWorkspace[];
  mcpServers?: McpServerForWorkspace[];
  plugins?: PluginForWorkspace[];
  documentGroups?: DocGroupForWorkspace[];
}

export interface DocGroupForWorkspace {
  id: string;
  name: string;
  storagePath: string;
  fileCount: number;
}

/** Manifest stored in each session workspace. */
export interface WorkspaceManifest {
  sessionId: string;
  businessScopeId: string;
  configVersion: number;
  agentId: string | null;
  provisionedAt: string;
  lastSyncedAt: string;
  agents: Array<{ id: string; name: string }>;
  skills: Array<{ id: string; name: string; hashId: string }>;
}

const MANIFEST_FILENAME = '.workspace-manifest.json';

export class WorkspaceManager {
  private readonly baseDir: string;
  private readonly s3Client: S3Client;

  constructor(baseDir?: string, s3Client?: S3Client) {
    this.baseDir = baseDir ?? config.claude.workspaceBaseDir;
    this.s3Client = s3Client ?? new S3Client({ region: config.aws.region });
  }

  // =========================================================================
  // Path helpers
  // =========================================================================

  /** Per-session workspace: {baseDir}/{orgId}/{scopeId}/sessions/{sessionId}/ */
  getSessionWorkspacePath(orgId: string, scopeId: string, sessionId: string): string {
    return join(this.baseDir, orgId, scopeId, 'sessions', sessionId);
  }

  /** Legacy per-agent workspace path (kept for backward compat). */
  getWorkspacePath(agentId: string): string {
    return join(this.baseDir, agentId);
  }

  getSkillsDir(agentId: string): string {
    return join(this.baseDir, agentId, '.claude', 'skills');
  }

  // =========================================================================
  // Session workspace provisioning
  // =========================================================================

  /**
   * Provision a brand-new session workspace with all scope artifacts.
   * Called once when a chat session is first created.
   */
  async ensureSessionWorkspace(
    orgId: string,
    sessionId: string,
    scope: ScopeForWorkspace,
    selectedAgentId: string | null,
  ): Promise<{ workspacePath: string; pluginPaths: string[] }> {
    const workspacePath = this.getSessionWorkspacePath(orgId, scope.id, sessionId);

    // Create directory structure (must complete before parallel writes)
    const skillsDir = join(workspacePath, '.claude', 'skills');
    const agentsDir = join(workspacePath, '.claude', 'agents');
    await Promise.all([
      mkdir(skillsDir, { recursive: true }),
      mkdir(agentsDir, { recursive: true }),
    ]);

    // --- Phase 1: Run all independent file generation + downloads in parallel ---
    const docGroups = scope.documentGroups ?? [];

    const createDocGroupSymlinks = async () => {
      if (docGroups.length === 0) return;
      const docsDir = join(workspacePath, 'documents');
      await mkdir(docsDir, { recursive: true });
      await Promise.all(docGroups.map(async (group) => {
        const linkName = group.name.replace(/[/\\:*?"<>|]/g, '-');
        const linkPath = join(docsDir, linkName);
        try {
          await symlink(group.storagePath, linkPath);
        } catch (err: any) {
          if (err.code !== 'EEXIST') {
            console.error(`Failed to symlink doc group "${group.name}":`, err.message);
          }
        }
      }));
    };

    const downloadAllSkills = async () => {
      await Promise.all(scope.skills.map(async (skill) => {
        try {
          await this.downloadSkill(skill, skillsDir);
        } catch (error) {
          console.error(`Failed to download skill "${skill.name}" for session ${sessionId}:`, error instanceof Error ? error.message : error);
        }
      }));
    };

    await Promise.all([
      this.generateScopeClaudeMd(workspacePath, scope, selectedAgentId),
      this.generateAgentSubagentFiles(agentsDir, scope.agents, skillsDir),
      this.generateSettings(workspacePath, scope.mcpServers),
      this.writeMemoryFiles(workspacePath, scope.id),
      createDocGroupSymlinks(),
      downloadAllSkills(),
    ]);

    // --- Phase 2: Things that depend on phase 1 ---
    // Built-in skills must run after S3 downloads (won't overwrite existing)
    const builtinCopied = await this.copyBuiltinSkills(skillsDir);
    if (builtinCopied.length > 0) {
      console.log(`Loaded built-in skills for session ${sessionId}: ${builtinCopied.join(', ')}`);
    }

    // Generate RAG knowledge-search skill if enabled and scope has document groups
    const { isRagEnabled } = await import('./rag/document-indexer.service.js');
    if (isRagEnabled() && docGroups.length > 0) {
      const ragSkillPath = join(skillsDir, 'knowledge-search.md');
      const backendUrl = `http://localhost:${process.env.PORT || 3001}`;
      const ragSkillContent = [
        '# Knowledge Search',
        '',
        'Use this skill to search the knowledge base for relevant document passages.',
        'This performs semantic similarity search — much more accurate than grep for finding relevant information.',
        '',
        '## When to Use',
        '- User asks about specific policies, procedures, or regulations',
        '- User needs information that might be in uploaded documents',
        '- You need to cite or reference specific document content',
        '- Grep/ripgrep returns too many or irrelevant results',
        '',
        '## How to Use',
        `Use the WebFetch tool to call: ${backendUrl}/api/rag/search?scope_id=${scope.id}&q={URL_ENCODED_QUERY}&top_k=5`,
        '',
        '## Response Format',
        'JSON with a `data` array. Each result contains:',
        '- `filename`: source document name',
        '- `content`: relevant text passage (~500 tokens)',
        '- `similarity`: relevance score (0-1, higher is better)',
        '- `chunkIndex`: position within the document',
        '',
        '## Tips',
        '- Use natural language queries, not keywords',
        '- If the first search is not specific enough, refine your query',
        '- Always cite the source filename when using retrieved information',
        '',
      ].join('\n');
      await writeFile(ragSkillPath, ragSkillContent, 'utf-8');
    }

    // Install plugins (git clone) — also parallelized internally
    const pluginPaths = await this.installPlugins(workspacePath, scope.plugins ?? []);

    // Write manifest
    const now = new Date().toISOString();
    await this.writeManifest(workspacePath, {
      sessionId,
      businessScopeId: scope.id,
      configVersion: scope.configVersion,
      agentId: selectedAgentId,
      provisionedAt: now,
      lastSyncedAt: now,
      agents: scope.agents.map(a => ({ id: a.id, name: a.name })),
      skills: scope.skills.map(s => ({ id: s.id, name: s.name, hashId: s.hashId })),
    });

    return { workspacePath, pluginPaths };
  }

  // =========================================================================
  // Lazy refresh (config version check)
  // =========================================================================

  /**
   * Check if the session workspace is up-to-date with the scope's config_version.
   * If stale, refresh the workspace files. Returns true if a refresh happened.
   */
  async ensureWorkspaceUpToDate(
    orgId: string,
    sessionId: string,
    scope: ScopeForWorkspace,
    selectedAgentId: string | null,
  ): Promise<{ refreshed: boolean; pluginPaths: string[] }> {
    const workspacePath = this.getSessionWorkspacePath(orgId, scope.id, sessionId);
    const manifest = await this.readManifest(workspacePath);

    if (!manifest) {
      // No manifest — full provision
      const result = await this.ensureSessionWorkspace(orgId, sessionId, scope, selectedAgentId);
      return { refreshed: true, pluginPaths: result.pluginPaths };
    }

    if (manifest.configVersion >= scope.configVersion) {
      // Already up to date — still resolve plugin paths for the SDK
      const pluginPaths = await this.installPlugins(workspacePath, scope.plugins ?? []);
      return { refreshed: false, pluginPaths };
    }

    // Refresh
    await this.refreshSessionWorkspace(workspacePath, scope, selectedAgentId, manifest);
    const pluginPaths = await this.installPlugins(workspacePath, scope.plugins ?? []);
    return { refreshed: true, pluginPaths };
  }

  /**
   * Targeted refresh: regenerate CLAUDE.md, agents, diff skills, update manifest.
   */
  async refreshSessionWorkspace(
    workspacePath: string,
    scope: ScopeForWorkspace,
    selectedAgentId: string | null,
    manifest: WorkspaceManifest,
  ): Promise<void> {
    // 1. Regenerate CLAUDE.md
    await this.generateScopeClaudeMd(workspacePath, scope, selectedAgentId);

    // 1b. Refresh memory files
    await this.writeMemoryFiles(workspacePath, scope.id);

    // 2. Regenerate agent subagent files
    const agentsDir = join(workspacePath, '.claude', 'agents');
    await rm(agentsDir, { recursive: true, force: true });
    await mkdir(agentsDir, { recursive: true });
    await this.generateAgentSubagentFiles(agentsDir, scope.agents, join(workspacePath, '.claude', 'skills'));

    // 3. Diff and sync skills
    await this.syncSkills(workspacePath, manifest.skills, scope.skills);

    // 4. Regenerate settings
    await this.generateSettings(workspacePath, scope.mcpServers);

    // 5. Sync document group symlinks
    const docGroups = scope.documentGroups ?? [];
    const docsDir = join(workspacePath, 'documents');
    if (docGroups.length > 0) {
      await mkdir(docsDir, { recursive: true });

      // Remove stale symlinks for groups no longer assigned
      const desiredNames = new Set(docGroups.map(g => g.name.replace(/[/\\:*?"<>|]/g, '-')));
      try {
        const existing = await readdir(docsDir);
        for (const entry of existing) {
          if (!desiredNames.has(entry)) {
            await rm(join(docsDir, entry), { force: true }).catch(() => {});
          }
        }
      } catch { /* docsDir may not exist yet */ }

      // Create missing symlinks
      for (const group of docGroups) {
        const linkName = group.name.replace(/[/\\:*?"<>|]/g, '-');
        const linkPath = join(docsDir, linkName);
        try {
          await symlink(group.storagePath, linkPath);
        } catch (err: any) {
          if (err.code !== 'EEXIST') {
            console.error(`Failed to symlink doc group "${group.name}":`, err.message);
          }
        }
      }
    } else {
      // No document groups — remove the documents directory if it exists
      await rm(docsDir, { recursive: true, force: true }).catch(() => {});
    }

    // 6. Regenerate RAG knowledge-search skill if applicable
    const skillsDir = join(workspacePath, '.claude', 'skills');
    const ragSkillPath = join(skillsDir, 'knowledge-search.md');
    const { isRagEnabled } = await import('./rag/document-indexer.service.js');
    if (isRagEnabled() && docGroups.length > 0) {
      const backendUrl = `http://localhost:${process.env.PORT || 3001}`;
      const ragSkillContent = [
        '# Knowledge Search',
        '',
        'Use this skill to search the knowledge base for relevant document passages.',
        'This performs semantic similarity search — much more accurate than grep for finding relevant information.',
        '',
        '## When to Use',
        '- User asks about specific policies, procedures, or regulations',
        '- User needs information that might be in uploaded documents',
        '- You need to cite or reference specific document content',
        '- Grep/ripgrep returns too many or irrelevant results',
        '',
        '## How to Use',
        `Use the WebFetch tool to call: ${backendUrl}/api/rag/search?scope_id=${scope.id}&q={URL_ENCODED_QUERY}&top_k=5`,
        '',
        '## Response Format',
        'JSON with a `data` array. Each result contains:',
        '- `filename`: source document name',
        '- `content`: relevant text passage (~500 tokens)',
        '- `similarity`: relevance score (0-1, higher is better)',
        '- `chunkIndex`: position within the document',
        '',
        '## Tips',
        '- Use natural language queries, not keywords',
        '- If the first search is not specific enough, refine your query',
        '- Always cite the source filename when using retrieved information',
        '',
      ].join('\n');
      await writeFile(ragSkillPath, ragSkillContent, 'utf-8');
    } else {
      // Remove stale RAG skill if no longer applicable
      await rm(ragSkillPath, { force: true }).catch(() => {});
    }

    // 7. Update manifest
    await this.writeManifest(workspacePath, {
      ...manifest,
      configVersion: scope.configVersion,
      lastSyncedAt: new Date().toISOString(),
      agents: scope.agents.map(a => ({ id: a.id, name: a.name })),
      skills: scope.skills.map(s => ({ id: s.id, name: s.name, hashId: s.hashId })),
    });
  }

  // =========================================================================
  // File generators
  // =========================================================================

  /** Generate CLAUDE.md at workspace root with scope context. */
  async generateScopeClaudeMd(
    workspacePath: string,
    scope: ScopeForWorkspace,
    selectedAgentId: string | null,
  ): Promise<void> {
    const lines: string[] = [`# ${scope.name}`, ''];
    if (scope.description) {
      lines.push(scope.description, '');
    }

    // Inject scope-level system prompt (behavior instructions for this business domain)
    if (scope.systemPrompt) {
      lines.push('## Scope Instructions', '');
      lines.push(scope.systemPrompt, '');
    }

    if (scope.agents.length > 0) {
      lines.push('## Available Agents', '');
      lines.push('You have access to specialized subagents for this business scope.');
      lines.push('When the user\'s request matches a specific agent\'s expertise, delegate to that subagent.');
      lines.push('**IMPORTANT**: When calling a subagent via the Task tool, you MUST use the agent\'s `name` (the identifier shown in parentheses), NOT the display name.', '');

      if (selectedAgentId) {
        const selected = scope.agents.find(a => a.id === selectedAgentId);
        if (selected) {
          lines.push(`The user has selected the "${selected.displayName}" agent (name: \`${selected.name}\`). Use this agent's expertise`);
          lines.push('as your primary mode of operation. You may still delegate to other agents if needed.', '');
        }
      }

      for (const agent of scope.agents) {
        lines.push(`- **${agent.displayName}** (name: \`${agent.name}\`): ${agent.role ?? 'General assistant'}`);
      }
      lines.push('');
    }

    lines.push('## Scope Rules', '');
    lines.push(`- Stay within the boundaries of the "${scope.name}" business domain`);
    lines.push('');
    lines.push('## Workspace Security', '');
    lines.push('- You must ONLY read, write, and search files within this workspace directory.');
    lines.push('- NEVER use absolute paths or traverse to parent directories using `..`.');
    lines.push('- NEVER run `find`, `ls`, `cat`, `grep`, or any command targeting paths outside this workspace.');
    lines.push('- All file operations must use relative paths rooted in the current working directory.');
    lines.push(`- The workspace root is: ${workspacePath}`);
    lines.push('- If a user asks to access files outside this workspace, politely decline and explain the restriction.');

    lines.push('');
    lines.push('## Application Code Directory', '');
    lines.push('- All application source code MUST be placed inside the `app/` directory.');
    lines.push('- The workspace root is reserved for system files (.claude/, documents/, memories/).');
    lines.push('- When creating new projects or features, always use `app/` as the base directory.');
    lines.push('- Example structure: `app/src/`, `app/public/`, `app/package.json`, etc.');

    // Inject document groups (Knowledge Base)
    const docGroups = scope.documentGroups ?? [];
    if (docGroups.length > 0) {
      lines.push('');
      lines.push('## Knowledge Base', '');
      lines.push('Reference documents are available in the `documents/` directory. These are **READ-ONLY**.');
      lines.push('- NEVER modify, delete, or create files inside `documents/`.');
      lines.push('- Use grep or ripgrep to search within these files when you need reference information.');

      // Add RAG instructions if enabled
      const { isRagEnabled: checkRag } = await import('./rag/document-indexer.service.js');
      if (checkRag()) {
        lines.push('- **Preferred**: Use the `knowledge-search` skill for semantic search — it finds relevant passages much more accurately than grep.');
      }

      lines.push('');
      lines.push('Available document groups:');
      for (const g of docGroups) {
        lines.push(`- \`documents/${g.name.replace(/[/\\:*?"<>|]/g, '-')}\` (${g.fileCount} file${g.fileCount !== 1 ? 's' : ''})`);
      }
      lines.push('');
    }

    // Memory — pinned memories inlined for instant recall, others on-demand
    const { scopeMemoryRepository: memRepo } = await import('../repositories/scope-memory.repository.js');
    const pinnedMemories = await memRepo.findForContext(scope.id).then(
      (all) => all.filter((m) => m.is_pinned),
    );

    lines.push('');
    lines.push('## Memory');
    lines.push('');

    // Inline pinned memories so the agent "just knows" critical info
    if (pinnedMemories.length > 0) {
      lines.push('### What you already know (pinned by user)');
      lines.push('');
      for (const m of pinnedMemories) {
        lines.push(`- **${m.title}**: ${m.content}`);
      }
      lines.push('');
      lines.push('The above is ground truth — if it conflicts with other context, trust this.');
      lines.push('');
    }

    lines.push('### Past knowledge (read on demand)');
    lines.push('');
    lines.push('Additional memories from past conversations are in `memories/`:');
    lines.push('');
    lines.push('- `memories/lessons.md` — Mistakes, corrections, and improvements');
    lines.push('- `memories/patterns.md` — Recurring user needs and effective solution paths');
    lines.push('- `memories/gaps.md` — Capability gaps and unresolved requests');
    lines.push('');
    lines.push('On your FIRST response, read `memories/lessons.md` to refresh context.');
    lines.push('Also check `memories/patterns.md` when a task feels familiar, and `memories/gaps.md` when stuck.');
    lines.push('');
    lines.push('These files are managed by the system — do not edit them.');
    lines.push('');

    await writeFile(join(workspacePath, 'CLAUDE.md'), lines.join('\n'), 'utf-8');
  }

  /**
   * Write scope memories as separate files in the workspace memories/ directory.
   * Agent reads these on-demand via Read/Grep tools instead of having them
   * inlined in CLAUDE.md (avoids context window bloat).
   *
   * File layout:
   *   memories/pinned.md   — User-pinned important knowledge (check first)
   *   memories/lessons.md  — Mistakes, corrections, improvements
   *   memories/patterns.md — Recurring needs and effective solutions
   *   memories/gaps.md     — Capability gaps and unresolved requests
   */
  async writeMemoryFiles(workspacePath: string, scopeId: string): Promise<void> {
    const { scopeMemoryRepository } = await import('../repositories/scope-memory.repository.js');
    const memories = await scopeMemoryRepository.findForContext(scopeId);
    if (memories.length === 0) return;

    const memoriesDir = join(workspacePath, 'memories');
    await mkdir(memoriesDir, { recursive: true });

    // Group memories by file target
    const pinned: typeof memories = [];
    const lessons: typeof memories = [];
    const patterns: typeof memories = [];
    const gaps: typeof memories = [];

    for (const m of memories) {
      if (m.is_pinned) {
        pinned.push(m);
      } else if (m.category === 'lesson') {
        lessons.push(m);
      } else if (m.category === 'pattern') {
        patterns.push(m);
      } else if (m.category === 'gap') {
        gaps.push(m);
      } else {
        // Uncategorized goes to lessons as a safe default
        lessons.push(m);
      }
    }

    const formatMemories = (items: typeof memories): string => {
      if (items.length === 0) return '*No entries yet.*\n';
      return items.map(m => {
        const autoLabel = m.tags.includes('auto-distilled') ? ' *(auto)* ' : ' ';
        const date = m.created_at instanceof Date
          ? m.created_at.toISOString().split('T')[0]
          : '';
        return `### ${date}: ${m.title}\n${autoLabel}\n${m.content}\n`;
      }).join('\n');
    };

    await writeFile(
      join(memoriesDir, 'pinned.md'),
      `# Pinned Knowledge\n\nImportant knowledge pinned by the user. Always check before complex work.\n\n${formatMemories(pinned)}`,
      'utf-8',
    );
    await writeFile(
      join(memoriesDir, 'lessons.md'),
      `# Lessons Learned\n\nMistakes, corrections, and improvements from past conversations.\n\n${formatMemories(lessons)}`,
      'utf-8',
    );
    await writeFile(
      join(memoriesDir, 'patterns.md'),
      `# Patterns\n\nRecurring user needs and effective solution paths.\n\n${formatMemories(patterns)}`,
      'utf-8',
    );
    await writeFile(
      join(memoriesDir, 'gaps.md'),
      `# Capability Gaps\n\nKnown limitations and unresolved requests.\n\n${formatMemories(gaps)}`,
      'utf-8',
    );
  }

  /** Generate .claude/agents/{name}.md subagent files from DB agents. */
  async generateAgentSubagentFiles(agentsDir: string, agents: AgentForWorkspace[], skillsDir?: string): Promise<void> {
    for (const agent of agents) {
      // Collect all skill names (existing + generated)
      const allSkillNames = [...agent.skillNames];

      // Write generated skills as SKILL.md files
      if (skillsDir && agent.generatedSkills && agent.generatedSkills.length > 0) {
        for (const skill of agent.generatedSkills) {
          const skillDir = join(skillsDir, skill.name);
          await mkdir(skillDir, { recursive: true });
          const skillContent = [
            '---',
            `name: ${skill.name}`,
            `description: ${skill.description}`,
            '---',
            '',
            skill.body,
          ].join('\n');
          await writeFile(join(skillDir, 'SKILL.md'), skillContent, 'utf-8');
          if (!allSkillNames.includes(skill.name)) {
            allSkillNames.push(skill.name);
          }
        }
      }

      const lines: string[] = ['---'];
      lines.push(`name: ${agent.name}`);
      lines.push(`description: ${agent.displayName} — ${agent.role ?? 'General assistant'}. Use when the user needs help with ${agent.role ?? 'this domain'}.`);
      lines.push('model: inherit');
      lines.push('permissionMode: bypassPermissions');
      if (allSkillNames.length > 0) {
        lines.push(`skills: ${allSkillNames.join(', ')}`);
      }
      lines.push('---', '');
      if (agent.systemPrompt) {
        lines.push(agent.systemPrompt);
      }

      const filename = `${agent.name}.md`;
      await writeFile(join(agentsDir, filename), lines.join('\n'), 'utf-8');
    }
  }

  /** Generate .claude/settings.json with permissions and optional MCP servers. */
  async generateSettings(workspacePath: string, mcpServers?: McpServerForWorkspace[]): Promise<void> {
    const settings: Record<string, unknown> = {
      permissions: {
        allow: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Skill', 'WebFetch'],
      },
    };

    const mcpConfig: Record<string, unknown> = {};

    // In agentcore mode, add built-in AgentCore tools (Browser + Code Interpreter)
    if (config.agentRuntime === 'agentcore') {
      const agentcoreRegion = config.agentcore.runtimeArn?.split(':')[3] || config.aws.region;
      mcpConfig['agentcore-tools'] = {
        type: 'stdio',
        command: 'uvx',
        args: ['awslabs.amazon-bedrock-agentcore-mcp-server@latest'],
        env: {
          AWS_REGION: agentcoreRegion,
          FASTMCP_LOG_LEVEL: 'ERROR',
        },
      };
    }

    // Write scope-level MCP servers so Claude Code discovers them via project settings
    if (mcpServers && mcpServers.length > 0) {
      for (const server of mcpServers) {
        // Prefer structured config if available
        if (server.config && typeof server.config === 'object') {
          const c = server.config as Record<string, unknown>;
          const type = (c.type as string) || 'stdio';
          if (type === 'sse' || type === 'http') {
            mcpConfig[server.name] = { type, url: c.url };
          } else {
            const entry: Record<string, unknown> = { type: 'stdio', command: c.command };
            if (Array.isArray(c.args)) entry.args = c.args;
            if (c.env && typeof c.env === 'object' && Object.keys(c.env as object).length > 0) entry.env = c.env;
            mcpConfig[server.name] = entry;
          }
          continue;
        }

        // Fallback: parse from hostAddress string
        const address = server.hostAddress?.trim();
        if (!address) continue;
        if (address.startsWith('http://') || address.startsWith('https://')) {
          mcpConfig[server.name] = { type: 'sse', url: address };
        } else {
          const parts = address.split(/\s+/);
          mcpConfig[server.name] = {
            type: 'stdio',
            command: parts[0],
            args: parts.length > 1 ? parts.slice(1) : undefined,
            ...(server.env && Object.keys(server.env).length > 0 ? { env: server.env } : {}),
          };
        }
      }
    }

    if (Object.keys(mcpConfig).length > 0) {
      settings.mcpServers = mcpConfig;
    }

    const settingsDir = join(workspacePath, '.claude');
    await mkdir(settingsDir, { recursive: true });
    await writeFile(join(settingsDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8');
  }

  // =========================================================================
  // Skill sync
  // =========================================================================

  /** Diff old vs new skills and only download changed/new ones. */
  async syncSkills(
    workspacePath: string,
    oldSkills: Array<{ id: string; name: string; hashId: string }>,
    newSkills: SkillForWorkspace[],
  ): Promise<void> {
    const oldMap = new Map(oldSkills.map(s => [s.id, s]));
    const newMap = new Map(newSkills.map(s => [s.id, s]));
    const skillsDir = join(workspacePath, '.claude', 'skills');

    // Remove deleted skills
    for (const [id, old] of oldMap) {
      if (!newMap.has(id)) {
        await rm(join(skillsDir, old.name), { recursive: true, force: true });
      }
    }

    // Add new or updated skills (hash changed)
    for (const [id, skill] of newMap) {
      const old = oldMap.get(id);
      if (!old || old.hashId !== skill.hashId) {
        try {
          await this.downloadSkill(skill, skillsDir);
        } catch (error) {
          console.error(`Failed to sync skill "${skill.name}":`, error instanceof Error ? error.message : error);
        }
      }
    }
  }

  // =========================================================================
  // Built-in skill loading (local filesystem)
  // =========================================================================

  /**
   * Copy all built-in skills from the local skills/ directory into the
   * workspace's .claude/skills/ folder. Skips skills that already exist
   * (S3-downloaded skills take precedence by name).
   */
  async copyBuiltinSkills(skillsDir: string): Promise<string[]> {
    const copied: string[] = [];
    try {
      await access(BUILTIN_SKILLS_DIR);
      const entries = await readdir(BUILTIN_SKILLS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const targetDir = join(skillsDir, entry.name);
        try {
          await access(targetDir);
          // Already exists (e.g. downloaded from S3) — skip
          continue;
        } catch {
          // Doesn't exist — copy it
        }
        await cp(join(BUILTIN_SKILLS_DIR, entry.name), targetDir, { recursive: true });
        copied.push(entry.name);
      }
    } catch (error) {
      console.warn('Could not load built-in skills:', error instanceof Error ? error.message : error);
    }
    return copied;
  }

  // =========================================================================
  // Plugin installation (git clone into workspace)
  // =========================================================================

  /**
   * Install plugins by cloning their git repos into .claude/plugins/{name}/.
   * Returns absolute paths to each installed plugin directory (for SDK `plugins` option).
   */
  async installPlugins(workspacePath: string, plugins: PluginForWorkspace[]): Promise<string[]> {
    if (!plugins || plugins.length === 0) return [];
    const pluginsDir = join(workspacePath, '.claude', 'plugins');
    await mkdir(pluginsDir, { recursive: true });

    const results = await Promise.all(plugins.map(async (plugin) => {
      const targetDir = join(pluginsDir, plugin.name);
      try {
        // Skip if already cloned
        await access(targetDir);
        return targetDir;
      } catch { /* not yet cloned */ }

      try {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);
        await execFileAsync('git', [
          'clone', '--depth', '1', '--branch', plugin.ref,
          plugin.gitUrl, targetDir,
        ], { timeout: 60_000 });
        console.log(`[installPlugins] Cloned plugin "${plugin.name}" from ${plugin.gitUrl}@${plugin.ref}`);
        return targetDir;
      } catch (error) {
        console.error(`[installPlugins] Failed to clone plugin "${plugin.name}":`, error instanceof Error ? error.message : error);
        return null;
      }
    }));

    return results.filter((p): p is string => p !== null);
  }

  // =========================================================================
  // S3 skill download (preserved from original)
  // =========================================================================

  async downloadSkill(skill: SkillForWorkspace, targetDir: string): Promise<boolean> {
    const skillDir = join(targetDir, skill.name);
    
    // Check for local path first (marketplace-installed skills)
    if (skill.localPath) {
      try {
        await access(skill.localPath);
        await mkdir(skillDir, { recursive: true });
        await cp(skill.localPath, skillDir, { recursive: true });
        console.log(`[downloadSkill] Copied local skill "${skill.name}" from ${skill.localPath}`);
        return true;
      } catch (error) {
        console.warn(`[downloadSkill] Local path not accessible for "${skill.name}": ${skill.localPath}, falling back to S3`);
      }
    }
    
    // Fall back to S3 download
    const s3Key = `${skill.s3Prefix}skill.zip`;
    try {
      const response = await this.s3Client.send(new GetObjectCommand({ Bucket: skill.s3Bucket, Key: s3Key }));
      if (!response.Body) {
        console.error(`Empty response body for skill "${skill.name}" from s3://${skill.s3Bucket}/${s3Key}`);
        // Fall through to inline body fallback
      } else {
        await mkdir(skillDir, { recursive: true });

        const zipPath = join(skillDir, 'skill.zip');
        const bodyStream = response.Body as Readable;
        const writeStream = createWriteStream(zipPath);
        await pipeline(bodyStream, writeStream);

        await this.extractSkillZip(zipPath, skillDir);

        try { await rm(zipPath, { force: true }); } catch { /* non-critical */ }
        return true;
      }
    } catch (error) {
      // S3 failed — fall through to inline body fallback
      if (!skill.body && !skill.description) {
        console.error(`S3 download failed for skill "${skill.name}" from s3://${skill.s3Bucket}/${s3Key}:`, error instanceof Error ? error.message : error);
      }
    }

    // Fallback: write inline body as SKILL.md (for scope-generator created skills)
    if (skill.body) {
      await mkdir(skillDir, { recursive: true });
      const content = [
        '---',
        `name: ${skill.name}`,
        ...(skill.description ? [`description: ${skill.description}`] : []),
        '---',
        '',
        skill.body,
      ].join('\n');
      await writeFile(join(skillDir, 'SKILL.md'), content, 'utf-8');
      console.log(`[downloadSkill] Wrote inline skill "${skill.name}" from metadata body`);
      return true;
    }

    // Last resort: write a minimal SKILL.md with just name and description
    // so the skill is still visible in the workspace even without full content
    if (skill.description) {
      await mkdir(skillDir, { recursive: true });
      const content = [
        '---',
        `name: ${skill.name}`,
        `description: ${skill.description}`,
        '---',
        '',
        `# ${skill.name}`,
        '',
        skill.description,
      ].join('\n');
      await writeFile(join(skillDir, 'SKILL.md'), content, 'utf-8');
      console.log(`[downloadSkill] Wrote minimal skill "${skill.name}" from description`);
      return true;
    }

    return false;
  }

  private async extractSkillZip(zipPath: string, targetDir: string): Promise<void> {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    try {
      await execFileAsync('unzip', ['-o', zipPath, '-d', targetDir]);
    } catch {
      try {
        await execFileAsync('python3', ['-m', 'zipfile', '-e', zipPath, targetDir]);
      } catch {
        console.warn(`Could not extract ${zipPath}: no unzip utility available`);
        throw new Error('Failed to extract skill archive: no extraction utility available');
      }
    }
  }

  // =========================================================================
  // Legacy workspace support (for backward compat with old per-agent flow)
  // =========================================================================

  async ensureWorkspace(agentId: string, skills: SkillForWorkspace[]): Promise<string> {
    const workspacePath = this.getWorkspacePath(agentId);
    const skillsDir = join(workspacePath, '.claude', 'skills');

    // Check if workspace can be reused via manifest
    if (await this.canReuseAgentWorkspace(agentId, skills)) {
      return workspacePath;
    }

    await mkdir(skillsDir, { recursive: true });
    for (const skill of skills) {
      try { await this.downloadSkill(skill, skillsDir); } catch (error) {
        console.error(`Failed to download skill "${skill.name}" for agent ${agentId}:`, error instanceof Error ? error.message : error);
      }
    }
    await this.copyBuiltinSkills(skillsDir);

    // Write legacy manifest for reuse checks
    await this.writeLegacyManifest(agentId, skills);

    return workspacePath;
  }

  private async canReuseAgentWorkspace(agentId: string, skills: SkillForWorkspace[]): Promise<boolean> {
    try {
      const manifestPath = join(this.getWorkspacePath(agentId), MANIFEST_FILENAME);
      await access(manifestPath);
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as { agentId: string; skills: Array<{ id: string; hashId: string }> };
      if (!manifest) return false;

      const currentSet = skills.map(s => `${s.id}:${s.hashId}`).sort().join(',');
      const manifestSet = manifest.skills.map((s: { id: string; hashId: string }) => `${s.id}:${s.hashId}`).sort().join(',');
      
      if (currentSet !== manifestSet) return false;
      
      // Also verify skills actually exist on disk
      const skillsDir = join(this.getWorkspacePath(agentId), '.claude', 'skills');
      for (const skill of skills) {
        const skillDir = join(skillsDir, skill.name);
        try {
          await access(skillDir);
        } catch {
          console.log(`[canReuseAgentWorkspace] Skill "${skill.name}" not found on disk, will re-provision`);
          return false;
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }

  private async writeLegacyManifest(agentId: string, skills: SkillForWorkspace[]): Promise<void> {
    const manifestPath = join(this.getWorkspacePath(agentId), MANIFEST_FILENAME);
    const now = new Date().toISOString();
    const manifest = {
      agentId,
      skills: skills.map(s => ({ id: s.id, hashId: s.hashId })),
      createdAt: now,
      updatedAt: now,
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  async deleteWorkspace(agentId: string): Promise<void> {
    const workspacePath = this.getWorkspacePath(agentId);
    try { await rm(workspacePath, { recursive: true, force: true }); } catch (error) {
      console.error(`Failed to delete workspace for agent ${agentId}:`, error instanceof Error ? error.message : error);
    }
  }

  // =========================================================================
  // Manifest I/O
  // =========================================================================

  async readManifest(workspacePath: string): Promise<WorkspaceManifest | null> {
    const manifestPath = join(workspacePath, MANIFEST_FILENAME);
    try {
      await access(manifestPath);
      const content = await readFile(manifestPath, 'utf-8');
      return JSON.parse(content) as WorkspaceManifest;
    } catch {
      return null;
    }
  }

  async writeManifest(workspacePath: string, manifest: WorkspaceManifest): Promise<void> {
    await writeFile(join(workspacePath, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2), 'utf-8');
  }

  /**
   * Ensure the local workspace is up-to-date with S3 (agentcore mode).
   * Downloads all files from S3 to the local workspace directory.
   * This is needed before operations that require local filesystem access
   * (e.g. dev server preview, app detection) because the agentcore container
   * writes files to S3 and the sync-back to local is fire-and-forget.
   *
   * Returns the number of files downloaded.
   */
  async ensureS3SyncedToLocal(
    orgId: string,
    scopeId: string,
    sessionId: string,
  ): Promise<number> {
    const s3Bucket = config.agentcore.workspaceS3Bucket;
    const prefix = `${orgId}/${scopeId}/${sessionId}/`;
    const localDir = this.getSessionWorkspacePath(orgId, scopeId, sessionId);

    let downloaded = 0;
    let continuationToken: string | undefined;

    do {
      const result = await this.s3Client.send(new ListObjectsV2Command({
        Bucket: s3Bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));

      for (const obj of result.Contents ?? []) {
        if (!obj.Key) continue;
        const relativePath = obj.Key.slice(prefix.length);
        if (!relativePath || relativePath.endsWith('/')) continue;

        // Skip directories that should not be synced to local
        // (node_modules, .git, etc. — same as upload skip list)
        const firstSegment = relativePath.split('/')[0];
        const SKIP_SEGMENTS = new Set([
          'node_modules', '.git', '__pycache__',
          '.venv', 'venv', 'env', '.env',
          '.tox', '.mypy_cache', '.pytest_cache', '.ruff_cache',
          '.next', '.nuxt', '.turbo', '.cache', '.parcel-cache',
          'bower_components', '.gradle', 'target', '.cargo',
        ]);
        if (SKIP_SEGMENTS.has(firstSegment)) continue;

        const localPath = join(localDir, relativePath);
        const localDirPath = dirname(localPath);

        try {
          await mkdir(localDirPath, { recursive: true });
          // Skip if localPath is already a directory
          try {
            const s = await stat(localPath);
            if (s.isDirectory()) continue;
          } catch { /* doesn't exist yet, fine */ }
          const response = await this.s3Client.send(new GetObjectCommand({
            Bucket: s3Bucket,
            Key: obj.Key,
          }));
          if (response.Body) {
            await pipeline(
              response.Body as NodeJS.ReadableStream,
              createWriteStream(localPath),
            );
            downloaded++;
          }
        } catch (err) {
          console.warn(`[workspace-manager] ensureS3SyncedToLocal failed for ${relativePath}:`, err instanceof Error ? err.message : err);
        }
      }

      continuationToken = result.NextContinuationToken;
    } while (continuationToken);

    if (downloaded > 0) {
      console.log(`[workspace-manager] Synced ${downloaded} files from S3 to local for session ${sessionId}`);
    }
    return downloaded;
  }

  /**
   * List files in a session workspace as a tree structure.
   * Returns null if the workspace doesn't exist.
   */
  async listWorkspaceFiles(
    orgId: string,
    scopeId: string,
    sessionId: string,
  ): Promise<WorkspaceFileNode[] | null> {
    const workspacePath = this.getSessionWorkspacePath(orgId, scopeId, sessionId);
    try {
      await access(workspacePath);
    } catch {
      return null;
    }
    return this.readDirRecursive(workspacePath, workspacePath);
  }

  /**
   * List workspace files from S3 (for agentcore mode where files live in the container).
   * Builds a tree from S3 object keys under the workspace prefix.
   */
  async listWorkspaceFilesFromS3(
    orgId: string,
    scopeId: string,
    sessionId: string,
    bucket?: string,
  ): Promise<WorkspaceFileNode[] | null> {
    const s3Bucket = bucket ?? config.agentcore.workspaceS3Bucket;
    const prefix = `${orgId}/${scopeId}/${sessionId}/`;

    try {
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      const allKeys: Array<{ key: string; size: number }> = [];
      let continuationToken: string | undefined;

      do {
        const result = await this.s3Client.send(new ListObjectsV2Command({
          Bucket: s3Bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }));
        for (const obj of result.Contents ?? []) {
          if (obj.Key) {
            const relKey = obj.Key.slice(prefix.length);
            if (relKey) allKeys.push({ key: relKey, size: obj.Size ?? 0 });
          }
        }
        continuationToken = result.NextContinuationToken;
      } while (continuationToken);

      if (allKeys.length === 0) return null;

      // Build tree from flat key list
      return this.buildTreeFromKeys(allKeys);
    } catch (err) {
      console.warn('[workspace-manager] Failed to list S3 workspace:', err);
      return null;
    }
  }

  private buildTreeFromKeys(keys: Array<{ key: string; size: number }>): WorkspaceFileNode[] {
    const root: Map<string, any> = new Map();

    for (const { key, size } of keys) {
      const parts = key.split('/');
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        if (i === parts.length - 1) {
          // File
          current.set(part, { type: 'file', size });
        } else {
          // Directory
          if (!current.has(part)) {
            current.set(part, new Map());
          }
          current = current.get(part);
        }
      }
    }

    const mapToNodes = (map: Map<string, any>, parentPath: string): WorkspaceFileNode[] => {
      const nodes: WorkspaceFileNode[] = [];
      const entries = [...map.entries()].sort(([aName, aVal], [bName, bVal]) => {
        const aIsDir = aVal instanceof Map;
        const bIsDir = bVal instanceof Map;
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return aName.localeCompare(bName);
      });

      for (const [name, value] of entries) {
        const path = parentPath ? `${parentPath}/${name}` : name;
        if (value instanceof Map) {
          nodes.push({ name, path, type: 'directory', children: mapToNodes(value, path) });
        } else {
          nodes.push({ name, path, type: 'file', size: value.size });
        }
      }
      return nodes;
    };

    return mapToNodes(root, '');
  }

  /**
   * Copy a marketplace-installed skill into a session workspace.
   */
  async installSkillToWorkspace(
    orgId: string,
    scopeId: string,
    sessionId: string,
    skillName: string,
    sourcePath: string,
  ): Promise<void> {
    const workspacePath = this.getSessionWorkspacePath(orgId, scopeId, sessionId);
    const skillsDir = join(workspacePath, '.claude', 'skills');
    await mkdir(skillsDir, { recursive: true });
    const targetDir = join(skillsDir, skillName);
    await cp(sourcePath, targetDir, { recursive: true });
  }

  /**
   * List skills installed in a session workspace.
   * Reads the .claude/skills/ directory and returns metadata for each skill.
   */
  async listWorkspaceSkills(
    orgId: string,
    scopeId: string,
    sessionId: string,
  ): Promise<Array<{ name: string; hasSkillMd: boolean; description: string | null }>> {
    const workspacePath = this.getSessionWorkspacePath(orgId, scopeId, sessionId);
    const skillsDir = join(workspacePath, '.claude', 'skills');
    try {
      await access(skillsDir);
    } catch {
      return [];
    }
    const entries = await readdir(skillsDir, { withFileTypes: true });
    const skills: Array<{ name: string; hasSkillMd: boolean; description: string | null }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let hasSkillMd = false;
      let description: string | null = null;
      try {
        const content = await readFile(join(skillsDir, entry.name, 'SKILL.md'), 'utf-8');
        hasSkillMd = true;
        // Try to extract description from first non-heading, non-empty line
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---')) continue;
          description = trimmed.length > 120 ? trimmed.substring(0, 120) + '…' : trimmed;
          break;
        }
      } catch { /* no SKILL.md */ }
      skills.push({ name: entry.name, hasSkillMd, description });
    }
    return skills;
  }

  /**
   * Delete a skill folder from a session workspace.
   * Returns true if deleted, false if not found.
   */
  async deleteWorkspaceSkill(
    orgId: string,
    scopeId: string,
    sessionId: string,
    skillName: string,
  ): Promise<boolean> {
    const workspacePath = this.getSessionWorkspacePath(orgId, scopeId, sessionId);
    const skillDir = join(workspacePath, '.claude', 'skills', skillName);
    // Prevent path traversal
    if (!skillDir.startsWith(join(workspacePath, '.claude', 'skills'))) return false;
    try {
      await access(skillDir);
      await rm(skillDir, { recursive: true, force: true });

      // In agentcore mode, also delete from S3
      if (config.agentRuntime === 'agentcore') {
        await this.deleteS3Prefix(
          `${orgId}/${scopeId}/${sessionId}/.claude/skills/${skillName}/`,
        ).catch(err => console.warn('[workspace-manager] S3 delete failed:', err));
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete all S3 objects under a prefix.
   */
  private async deleteS3Prefix(prefix: string): Promise<void> {
    const { ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
    const bucket = config.agentcore.workspaceS3Bucket;
    let continuationToken: string | undefined;

    do {
      const result = await this.s3Client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));

      const objects = (result.Contents ?? [])
        .filter((obj): obj is { Key: string } => !!obj.Key)
        .map(obj => ({ Key: obj.Key }));

      if (objects.length > 0) {
        await this.s3Client.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects },
        }));
      }

      continuationToken = result.NextContinuationToken;
    } while (continuationToken);
  }

  /**
   * Read a single file from a session workspace. Returns null if not found.
   */
  async readWorkspaceFile(
    orgId: string,
    scopeId: string,
    sessionId: string,
    filePath: string,
  ): Promise<string | null> {
    const workspacePath = this.getSessionWorkspacePath(orgId, scopeId, sessionId);
    // Prevent path traversal
    const resolved = join(workspacePath, filePath);
    if (!resolved.startsWith(workspacePath)) return null;
    try {
      // stat follows symlinks — check if target is a directory
      const fileStat = await stat(resolved);
      if (fileStat.isDirectory()) {
        // Return a listing of the directory contents
        const entries = await readdir(resolved);
        return entries.join('\n');
      }
      return await readFile(resolved, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Read a workspace file from S3 (fallback for agentcore mode when
   * the file only exists in the container and was synced to S3).
   */
  async readWorkspaceFileFromS3(
    orgId: string,
    scopeId: string,
    sessionId: string,
    filePath: string,
  ): Promise<string | null> {
    const s3Bucket = config.agentcore.workspaceS3Bucket;
    const key = `${orgId}/${scopeId}/${sessionId}/${filePath}`;
    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: s3Bucket,
        Key: key,
      }));
      if (response.Body && typeof (response.Body as any).transformToString === 'function') {
        return await (response.Body as any).transformToString();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Read a workspace file from S3 as raw binary Buffer.
   * Used for binary files (images, xlsx, etc.) that cannot be safely converted to UTF-8 strings.
   */
  async readWorkspaceFileFromS3Raw(
    orgId: string,
    scopeId: string,
    sessionId: string,
    filePath: string,
  ): Promise<Buffer | null> {
    const s3Bucket = config.agentcore.workspaceS3Bucket;
    const key = `${orgId}/${scopeId}/${sessionId}/${filePath}`;
    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: s3Bucket,
        Key: key,
      }));
      if (response.Body && typeof (response.Body as any).transformToByteArray === 'function') {
        const bytes = await (response.Body as any).transformToByteArray();
        return Buffer.from(bytes);
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Resolve a workspace-relative file path to an absolute path, with traversal protection. Returns null if invalid. */
  resolveWorkspaceFilePath(
    orgId: string,
    scopeId: string,
    sessionId: string,
    filePath: string,
  ): string | null {
    const workspacePath = this.getSessionWorkspacePath(orgId, scopeId, sessionId);
    const resolved = join(workspacePath, filePath);
    if (!resolved.startsWith(workspacePath)) return null;
    return resolved;
  }


  async writeWorkspaceFile(
    orgId: string,
    scopeId: string,
    sessionId: string,
    filePath: string,
    content: string,
  ): Promise<boolean> {
    const workspacePath = this.getSessionWorkspacePath(orgId, scopeId, sessionId);
    const resolved = join(workspacePath, filePath);
    if (!resolved.startsWith(workspacePath)) return false;
    try {
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, content, 'utf-8');

      // In agentcore mode, also upload to S3 so the container picks it up
      if (config.agentRuntime === 'agentcore') {
        const { PutObjectCommand } = await import('@aws-sdk/client-s3');
        const key = `${orgId}/${scopeId}/${sessionId}/${filePath}`;
        await this.s3Client.send(new PutObjectCommand({
          Bucket: config.agentcore.workspaceS3Bucket,
          Key: key,
          Body: content,
        })).catch(err => console.warn('[workspace-manager] S3 upload failed:', err));
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Write raw binary data (Buffer) to a workspace file.
   * Unlike writeWorkspaceFile, this does NOT apply UTF-8 encoding,
   * so binary files (images, PDFs, etc.) are preserved correctly.
   */
  async writeWorkspaceFileRaw(
    orgId: string,
    scopeId: string,
    sessionId: string,
    filePath: string,
    content: Buffer,
  ): Promise<boolean> {
    const workspacePath = this.getSessionWorkspacePath(orgId, scopeId, sessionId);
    const resolved = join(workspacePath, filePath);
    if (!resolved.startsWith(workspacePath)) return false;
    try {
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, content);

      // In agentcore mode, also upload to S3 so the container picks it up
      if (config.agentRuntime === 'agentcore') {
        const { PutObjectCommand } = await import('@aws-sdk/client-s3');
        const key = `${orgId}/${scopeId}/${sessionId}/${filePath}`;
        await this.s3Client.send(new PutObjectCommand({
          Bucket: config.agentcore.workspaceS3Bucket,
          Key: key,
          Body: content,
        })).catch(err => console.warn('[workspace-manager] S3 upload failed:', err));

        // Notify the running container to pull the file from S3.
        // Fire-and-forget: don't block the upload response if the container
        // is not running or the sync fails (file is already in S3 and will
        // be picked up on next invocation).
        import('./agentcore-command.service.js').then(({ agentCoreCommandService }) => {
          agentCoreCommandService.syncFileFromS3(
            sessionId,
            config.agentcore.workspaceS3Bucket,
            key,
            filePath,
          ).catch(err => console.warn('[workspace-manager] Container sync failed (non-fatal):', err instanceof Error ? err.message : err));
        });
      }

      return true;
    } catch {
      return false;
    }
  }


  /** Directories to show in the tree but NOT recurse into (too large / not useful). */
  private static readonly SHALLOW_DIRS = new Set([
    'node_modules', '.git', '.next', '.nuxt', '.cache', 'dist', 'build',
    '__pycache__', '.venv', 'venv', '.tox',
  ]);

  private async readDirRecursive(dir: string, rootDir: string): Promise<WorkspaceFileNode[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const nodes: WorkspaceFileNode[] = [];

    // Resolve whether each entry is a directory, following symlinks
    const resolvedEntries: Array<{ entry: import('fs').Dirent; isDir: boolean }> = [];
    for (const entry of entries) {
      let isDir = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try {
          const targetStat = await stat(join(dir, entry.name)); // stat follows symlinks
          isDir = targetStat.isDirectory();
        } catch {
          // Broken symlink — treat as file
          isDir = false;
        }
      }
      resolvedEntries.push({ entry, isDir });
    }

    resolvedEntries.sort((a, b) => {
      // Directories first, then alphabetical
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.entry.name.localeCompare(b.entry.name);
    });

    for (const { entry, isDir } of resolvedEntries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relative(rootDir, fullPath);
      if (isDir) {
        if (WorkspaceManager.SHALLOW_DIRS.has(entry.name)) {
          nodes.push({ name: entry.name, path: relativePath, type: 'directory', children: [] });
        } else {
          try {
            const children = await this.readDirRecursive(fullPath, rootDir);
            nodes.push({ name: entry.name, path: relativePath, type: 'directory', children });
          } catch {
            // Directory may have been removed or is a broken symlink — show as empty
            nodes.push({ name: entry.name, path: relativePath, type: 'directory', children: [] });
          }
        }
      } else {
        try {
          const fileStat = await stat(fullPath);
          nodes.push({ name: entry.name, path: relativePath, type: 'file', size: fileStat.size });
        } catch {
          // File may have been removed or is a broken symlink — show with size 0
          nodes.push({ name: entry.name, path: relativePath, type: 'file', size: 0 });
        }
      }
    }
    return nodes;
  }

  /**
   * Remove session workspace directories whose manifests are older than maxAgeMs.
   * Returns the number of directories removed.
   */
  async pruneStaleWorkspaces(maxAgeMs: number = 2400 * 60 * 60 * 1000): Promise<number> {
    let removed = 0;
    const now = Date.now();
    try {
      const orgs = await readdir(this.baseDir, { withFileTypes: true });
      for (const org of orgs) {
        if (!org.isDirectory()) continue;
        const orgDir = join(this.baseDir, org.name);
        const scopes = await readdir(orgDir, { withFileTypes: true }).catch(() => []);
        for (const scope of scopes) {
          if (!scope.isDirectory()) continue;
          const sessionsDir = join(orgDir, scope.name, 'sessions');
          const sessions = await readdir(sessionsDir, { withFileTypes: true }).catch(() => []);
          for (const sess of sessions) {
            if (!sess.isDirectory()) continue;
            const wsPath = join(sessionsDir, sess.name);
            const manifest = await this.readManifest(wsPath);
            const lastSync = manifest?.lastSyncedAt ? new Date(manifest.lastSyncedAt).getTime() : 0;
            if (now - lastSync > maxAgeMs) {
              await rm(wsPath, { recursive: true, force: true }).catch(() => {});
              removed++;
            }
          }
        }
      }
    } catch {
      // baseDir may not exist yet
    }
    return removed;
  }
}

export const workspaceManager = new WorkspaceManager();
