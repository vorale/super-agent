/**
 * Scope Generator Service
 *
 * Uses the configured Agent Runtime (claude or agentcore) to generate a
 * business scope + agents from a free-text business description.
 *
 * The active runtime is determined by the AGENT_RUNTIME env var via the
 * shared agent-runtime-factory. When running under AgentCore the workspace
 * files live in S3 — the service waits for sync-back or reads directly
 * from S3 before checking for scope-config.json.
 */

import { agentRuntime } from './agent-runtime-factory.js';
import type { AgentConfig, ConversationEvent } from './agent-runtime.js';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';
import { config } from '../config/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedScope {
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface GeneratedSkill {
  name: string;
  description: string;
  body: string;
}

export interface GeneratedAgent {
  name: string;
  displayName: string;
  role: string;
  systemPrompt: string;
  skills: GeneratedSkill[];
}

export interface GeneratedScopeConfig {
  scope: GeneratedScope;
  agents: GeneratedAgent[];
}

// ---------------------------------------------------------------------------
// System prompt for scope generation
// ---------------------------------------------------------------------------

const SCOPE_GENERATOR_SYSTEM_PROMPT = `You are a business scope architect for an AI agent platform. Your job is to analyze a business description and generate a structured scope configuration with specialized AI agents, each equipped with domain-specific skills.

CRITICAL: After generating the configuration, you MUST write the final JSON to a file called "scope-config.json" in the current working directory. Use your file writing tools to create this file. The file must contain ONLY valid JSON with no markdown or extra text.

The JSON must follow this exact schema:
{
  "scope": {
    "name": "string (short, 2-4 words)",
    "description": "string (1-2 sentences describing the scope)",
    "icon": "string (single emoji that represents the business)",
    "color": "string (hex color code like #3B82F6)"
  },
  "agents": [
    {
      "name": "string (kebab-case identifier, e.g. customer-support)",
      "displayName": "string (human-readable name)",
      "role": "string (brief role description, 5-10 words)",
      "systemPrompt": "string (detailed system prompt for the agent, 2-4 paragraphs)",
      "skills": [
        {
          "name": "string (kebab-case skill name, e.g. ticket-triage)",
          "description": "string (1-2 sentences: what the skill does and when to use it)",
          "body": "string (markdown instructions for the agent when using this skill, 5-20 lines)"
        }
      ]
    }
  ]
}

Guidelines:
- Generate 1-4 agents depending on business complexity. Prefer fewer agents — consolidate related responsibilities into a single agent rather than creating many narrow ones. In real organizations, one person often wears multiple hats, so each agent should reflect a realistic role that covers several related duties. Only create a separate agent when responsibilities are truly distinct and would conflict if combined.
- Each agent should have a distinct, non-overlapping responsibility
- Agent names should be kebab-case (e.g. "hr-assistant", "sales-ops")
- System prompts should be detailed and specific to the agent's role
- System prompts should define the agent's personality, expertise, constraints, and output format
- Choose an icon emoji that best represents the overall business
- Choose a color that feels appropriate for the business domain
- The scope name should be concise but descriptive

Skill guidelines:
- Generate 1-3 skills per agent based on their core responsibilities
- Each skill should represent a distinct, reusable workflow or domain expertise
- Skill names should be kebab-case and action-oriented (e.g. "analyze-risk", "draft-response")
- The description is the primary trigger — be specific about what the skill does and when to use it
- The body should contain concise, actionable instructions (not verbose explanations)
- Prefer examples and step-by-step procedures over general descriptions
- Skills should encode domain knowledge the agent wouldn't inherently have

Remember: Write the final JSON to "scope-config.json" in the current directory. This is mandatory.

CRITICAL BEHAVIORAL RULES:
- NEVER ask clarifying questions. NEVER ask the user for more information. Work with whatever input is provided, no matter how brief or vague.
- If the business description is short or ambiguous, make reasonable assumptions and generate a complete configuration immediately.
- Your ONLY job is to analyze the input and produce the JSON file. Do not engage in conversation.
- Start working immediately upon receiving the user message. Do not output preamble or ask for confirmation.`;

// ---------------------------------------------------------------------------
// Language instruction helpers
// ---------------------------------------------------------------------------

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  en: `
LANGUAGE REQUIREMENT: All generated content MUST be in English.
- scope.name, scope.description: English
- agent.displayName, agent.role, agent.systemPrompt: English
- skill.name (kebab-case, always English), skill.description, skill.body: English
- Even if the user's business description is in another language, translate and generate all output in English.`,
  cn: `
LANGUAGE REQUIREMENT: All generated content MUST be in Chinese (中文).
- scope.name, scope.description: 中文
- agent.displayName, agent.role, agent.systemPrompt: 中文
- skill.name: 保持 kebab-case 英文格式（如 "analyze-risk"），但 skill.description 和 skill.body 必须使用中文
- 即使用户的业务描述是英文的，也必须将所有输出翻译为中文生成。
- 请确保系统提示词（systemPrompt）使用流畅、专业的中文撰写。`,
};

/**
 * Build the full system prompt with language-specific instructions appended.
 */
function buildSystemPrompt(language?: string): string {
  const langKey = language === 'cn' ? 'cn' : 'en';
  return SCOPE_GENERATOR_SYSTEM_PROMPT + '\n' + LANGUAGE_INSTRUCTIONS[langKey];
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Maximum number of repair attempts when the generated JSON is invalid. */
const MAX_REPAIR_ATTEMPTS = 2;

/**
 * Validate that a string is valid JSON conforming to the GeneratedScopeConfig
 * schema. Returns the parsed config on success, or a descriptive error string
 * on failure.
 */
function validateScopeConfigJson(raw: string): { ok: true; config: GeneratedScopeConfig } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Root value must be a JSON object' };
  }

  const obj = parsed as Record<string, unknown>;

  // --- scope ---
  if (!obj.scope || typeof obj.scope !== 'object' || Array.isArray(obj.scope)) {
    return { ok: false, error: 'Missing or invalid "scope" object' };
  }
  const scope = obj.scope as Record<string, unknown>;
  for (const field of ['name', 'description', 'icon', 'color']) {
    if (typeof scope[field] !== 'string' || (scope[field] as string).trim().length === 0) {
      return { ok: false, error: `scope.${field} must be a non-empty string` };
    }
  }

  // --- agents ---
  if (!Array.isArray(obj.agents) || obj.agents.length === 0) {
    return { ok: false, error: '"agents" must be a non-empty array' };
  }

  for (let i = 0; i < obj.agents.length; i++) {
    const agent = obj.agents[i] as Record<string, unknown>;
    for (const field of ['name', 'displayName', 'role', 'systemPrompt']) {
      if (typeof agent[field] !== 'string' || (agent[field] as string).trim().length === 0) {
        return { ok: false, error: `agents[${i}].${field} must be a non-empty string` };
      }
    }
    if (!Array.isArray(agent.skills)) {
      return { ok: false, error: `agents[${i}].skills must be an array` };
    }
    for (let j = 0; j < (agent.skills as unknown[]).length; j++) {
      const skill = (agent.skills as Record<string, unknown>[])[j];
      for (const field of ['name', 'description', 'body']) {
        if (typeof skill[field] !== 'string' || (skill[field] as string).trim().length === 0) {
          return { ok: false, error: `agents[${i}].skills[${j}].${field} must be a non-empty string` };
        }
      }
    }
  }

  return { ok: true, config: parsed as GeneratedScopeConfig };
}

// ---------------------------------------------------------------------------
// AgentCore S3 file reading helpers
// ---------------------------------------------------------------------------

/**
 * Wait for a local file to appear (sync-back from S3 may be in progress).
 * Returns true if the file appeared within the timeout, false otherwise.
 */
async function waitForLocalFile(filePath: string, timeoutMs: number = 10_000, intervalMs: number = 500): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(filePath)) return true;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return existsSync(filePath);
}

/**
 * Read scope-config.json content, with S3 fallback for AgentCore mode.
 *
 * In AgentCore mode the container writes files to S3. The sync-back to local
 * is fire-and-forget, so the file may not be on disk yet when we check.
 * This function:
 *   1. Waits briefly for the local file to appear (sync-back in progress)
 *   2. If still missing and running AgentCore, reads directly from S3
 */
async function readConfigFile(
  localPath: string,
  s3Prefix: string | undefined,
): Promise<string | null> {
  // Fast path: file already on disk
  if (existsSync(localPath)) {
    return readFile(localPath, 'utf-8');
  }

  // In AgentCore mode, wait a bit for sync-back then try S3 directly
  if (config.agentRuntime === 'agentcore' && s3Prefix) {
    // Give sync-back a chance to complete
    const appeared = await waitForLocalFile(localPath, 8_000);
    if (appeared) {
      return readFile(localPath, 'utf-8');
    }

    // Read directly from S3
    try {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const s3Client = new S3Client({ region: config.agentcore.region });
      const s3Key = `${s3Prefix}scope-config.json`;
      console.log(`[scope-generator] Reading scope-config.json from S3: s3://${config.agentcore.workspaceS3Bucket}/${s3Key}`);
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: config.agentcore.workspaceS3Bucket,
        Key: s3Key,
      }));
      if (response.Body) {
        return await response.Body.transformToString('utf-8');
      }
    } catch (err) {
      console.warn('[scope-generator] Failed to read scope-config.json from S3:', err instanceof Error ? err.message : err);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ScopeGeneratorService {
  /**
   * Generate a scope configuration by streaming Claude's response.
   * Yields ConversationEvents that can be forwarded as SSE.
   *
   * After the initial generation, the service validates the produced JSON.
   * If it is malformed or structurally invalid, the agent is asked to repair
   * it (up to {@link MAX_REPAIR_ATTEMPTS} times) before giving up.
   *
   * @param businessDescription - The text prompt for the agent.
   * @param sopDocument - Optional SOP document buffer + filename to place in the workspace.
   *                      The agent will be instructed to read and parse it using its tools.
   */
  async *generate(businessDescription: string, sopDocument?: { buffer: Buffer; fileName: string }, language?: string): AsyncGenerator<ConversationEvent> {
      const agentConfig: AgentConfig = {
        id: 'scope-generator',
        name: 'scope-generator',
        displayName: 'Scope Generator',
        organizationId: 'system',
        systemPrompt: buildSystemPrompt(language),
        skillIds: [],
        mcpServerIds: [],
      };

      // Always create a fresh temp workspace (consistent across all strategies)
      const tempWorkspace = await mkdtemp(join(tmpdir(), 'scope-gen-'));
      const configFilePath = join(tempWorkspace, 'scope-config.json');

      let message: string;

      if (sopDocument) {
        // Place the document in the workspace for the agent to read
        const filePath = join(tempWorkspace, sopDocument.fileName);
        await writeFile(filePath, sopDocument.buffer);

        message = [
          `A SOP document has been placed in your working directory as "${sopDocument.fileName}".`,
          `Please read and parse this document first using your file reading tools.`,
          `If it is a PDF, use a shell command like \`pdftotext "${sopDocument.fileName}" - 2>/dev/null || strings "${sopDocument.fileName}"\` to extract text.`,
          `If it is a DOCX file, use \`unzip -p "${sopDocument.fileName}" word/document.xml 2>/dev/null | sed -e 's/<[^>]*>//g'\` to extract text content.`,
          `For plain text or markdown files, read them directly.`,
          ``,
          `Then analyze the extracted content and generate a scope configuration with specialized AI agents.`,
          `Write the final JSON result to "scope-config.json" in the current directory.`,
          ``,
          `Additional context from the user:`,
          businessDescription,
        ].join('\n');
      } else {
        message = `Analyze this business and generate a scope configuration with specialized AI agents. Write the final JSON result to "scope-config.json" in the current directory.\n\n${businessDescription}`;
      }

      // Use a stable session ID so repair turns share the same conversation context
      const sessionId = `scope-gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Compute S3 prefix for AgentCore mode (must match what AgentCoreAgentRuntime builds)
      const s3Prefix = config.agentRuntime === 'agentcore'
        ? `system/system/${sessionId}/`
        : undefined;

      try {
        // ---- Initial generation ----
        yield* agentRuntime.runConversation(
          {
            agentId: 'scope-generator',
            sessionId,
            message,
            organizationId: 'system',
            userId: 'system',
            workspacePath: tempWorkspace,
            scopeId: 'system',
          },
          agentConfig,
          [], // no skills needed for generation
        );

        // ---- Validate & repair loop ----
        let validConfig: GeneratedScopeConfig | null = null;

        for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
          // Read config file (local-first, S3 fallback for AgentCore)
          const fileContent = await readConfigFile(configFilePath, s3Prefix);

          if (fileContent === null) {
            if (attempt === MAX_REPAIR_ATTEMPTS) {
              console.error('[scope-generator] scope-config.json still not found after repair attempts');
              break;
            }
            console.warn(`[scope-generator] scope-config.json not found (attempt ${attempt}), asking agent to repair...`);

            yield* this.requestRepair(
              sessionId,
              tempWorkspace,
              agentConfig,
              'The file "scope-config.json" was not found in the working directory. You MUST write the complete scope configuration JSON to "scope-config.json" now. Do not output anything else — just write the file.',
            );
            continue;
          }

          const result = validateScopeConfigJson(fileContent);

          if (result.ok) {
            validConfig = result.config;
            console.log('[scope-generator] scope-config.json validated successfully');
            break;
          }

          // Validation failed
          if (attempt === MAX_REPAIR_ATTEMPTS) {
            console.error(`[scope-generator] scope-config.json still invalid after ${MAX_REPAIR_ATTEMPTS} repair attempts: ${result.error}`);
            break;
          }

          console.warn(`[scope-generator] scope-config.json validation failed (attempt ${attempt}): ${result.error}. Asking agent to repair...`);

          // Delete the broken file so the agent writes a fresh one
          await rm(configFilePath, { force: true });

          yield* this.requestRepair(
            sessionId,
            tempWorkspace,
            agentConfig,
            [
              `The "scope-config.json" you wrote is invalid. Validation error:`,
              `  ${result.error}`,
              ``,
              `Please fix the issue and write a corrected version to "scope-config.json". The file must contain ONLY valid JSON conforming to the required schema (with "scope" and "agents" fields). Do not include any markdown or extra text in the file.`,
            ].join('\n'),
          );
        }

        // Emit the validated config to the frontend
        if (validConfig) {
          yield {
            type: 'scope_config' as ConversationEvent['type'],
            content: JSON.stringify(validConfig),
          } as unknown as ConversationEvent;
        }
      } finally {
        // Clean up temp workspace
        rm(tempWorkspace, { recursive: true, force: true }).catch(() => {});
      }
    }

  /**
   * Ask the agent to repair the scope-config.json file within the same
   * conversation session. Yields all conversation events so the frontend
   * can display progress.
   */
  private async *requestRepair(
    sessionId: string,
    workspacePath: string,
    agentConfig: AgentConfig,
    repairMessage: string,
  ): AsyncGenerator<ConversationEvent> {
    // Notify the frontend that a repair is in progress
    yield {
      type: 'assistant' as ConversationEvent['type'],
      content: [{ type: 'text', text: '\n\n🔄 Validating and repairing scope configuration...\n' }],
    } as unknown as ConversationEvent;

    yield* agentRuntime.runConversation(
      {
        agentId: 'scope-generator',
        sessionId,
        message: repairMessage,
        organizationId: 'system',
        userId: 'system',
        workspacePath,
        scopeId: 'system',
      },
      agentConfig,
      [],
    );
  }

  /**
   * Generate a Digital Twin configuration by streaming Claude's response.
   * Analyzes uploaded documents to create a persona-specific system prompt and skills.
   */
  async *generateTwin(
    twinInfo: { displayName: string; role: string; description: string },
    documents?: Array<{ buffer: Buffer; fileName: string }>,
  ): AsyncGenerator<ConversationEvent> {
    const TWIN_SYSTEM_PROMPT = `You are a Digital Twin architect. Your ONLY job is to generate a digital twin configuration JSON that is HIGHLY SPECIFIC to the person's role and expertise. You must NEVER ask questions. Work with whatever information is provided.

CRITICAL RULES:
1. NEVER generate generic/general-purpose skills. Every skill MUST be specific to the person's stated role and domain.
2. The system prompt MUST reference the person's specific field, technologies, and expertise areas by name.
3. If the role is "Cloud Solutions Architect", the skills must be about cloud architecture, NOT generic "problem-solving" or "communication".
4. Output the COMPLETE JSON directly in your response wrapped in a json code fence. Do NOT use any file writing tools.
5. NEVER ask questions. Generate immediately.

Output EXACTLY this format (wrapped in \`\`\`json code fence):

\`\`\`json
{
  "scope": {
    "name": "${twinInfo.displayName}",
    "description": "Digital twin of ${twinInfo.displayName} - ${twinInfo.role}",
    "icon": "🤖",
    "color": "#6366f1"
  },
  "systemPrompt": "MUST mention the person's specific role (${twinInfo.role}), their domain expertise, specific technologies/tools they use, and their professional approach. 3-6 paragraphs.",
  "skills": [
    {
      "name": "domain-specific-skill-name",
      "description": "MUST be specific to ${twinInfo.role} domain, NOT generic",
      "body": "markdown instructions with domain-specific methodology, tools, frameworks, and best practices relevant to ${twinInfo.role}"
    }
  ]
}
\`\`\`

QUALITY CHECK — before outputting, verify:
- Does the systemPrompt mention "${twinInfo.role}" and specific technologies?
- Are ALL skills directly relevant to "${twinInfo.role}"?
- Would a "${twinInfo.role}" actually use these skills daily?
- If any skill is generic (like "problem-solving" or "communication"), REPLACE it with a domain-specific one.`;

    const agentConfig: AgentConfig = {
      id: 'twin-generator',
      name: 'twin-generator',
      displayName: 'Digital Twin Generator',
      organizationId: 'system',
      systemPrompt: TWIN_SYSTEM_PROMPT,
      skillIds: [],
      mcpServerIds: [],
    };

    const tempWorkspace = await mkdtemp(join(tmpdir(), 'twin-gen-'));
    const configFilePath = join(tempWorkspace, 'scope-config.json');

    // Place documents in workspace
    if (documents && documents.length > 0) {
      for (const doc of documents) {
        await writeFile(join(tempWorkspace, doc.fileName), doc.buffer);
      }
    }

    const docInstructions = documents && documents.length > 0
      ? [
          `The following documents have been placed in your working directory:`,
          ...documents.map(d => `- "${d.fileName}"`),
          `Please read and analyze these documents to understand the person's expertise.`,
          `If a file is PDF, use: pdftotext "filename" - 2>/dev/null || strings "filename"`,
          `If a file is DOCX, use: unzip -p "filename" word/document.xml 2>/dev/null | sed -e 's/<[^>]*>//g'`,
          `For plain text or markdown files, read them directly.`,
          '',
        ].join('\n')
      : '';

    const message = [
      docInstructions,
      `Generate a digital twin configuration NOW for the following person. Do NOT ask any questions. Output the JSON directly in your response.`,
      '',
      `Name: ${twinInfo.displayName}`,
      `Role: ${twinInfo.role || 'General professional'}`,
      `Description: ${twinInfo.description || 'A professional in their field.'}`,
      '',
      `Based on this information${documents ? ' and the uploaded documents' : ''}, immediately output the complete JSON configuration wrapped in a json code fence.`,
    ].join('\n');

    try {
      // Accumulate all text content for fallback JSON extraction
      const allTextBlocks: string[] = [];

      // Use a unique session ID per generation to avoid AgentCore session reuse
      const uniqueSessionId = `twin-gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      for await (const event of agentRuntime.runConversation(
        { agentId: 'twin-generator', sessionId: uniqueSessionId, message, organizationId: 'system', userId: 'system', workspacePath: tempWorkspace, scopeId: 'system' },
        agentConfig,
        [],
      )) {
        // Collect text blocks for JSON extraction
        if ((event.type === 'assistant' || event.type === 'result') && event.content) {
          for (const block of event.content) {
            if (block.type === 'text' && 'text' in block) {
              allTextBlocks.push((block as { type: 'text'; text: string }).text);
            }
          }
        }
        yield event;
      }

      // Strategy 1: Read scope-config.json from workspace (if agent wrote it)
      if (existsSync(configFilePath)) {
        const fileContent = await readFile(configFilePath, 'utf-8');
        console.log(`[twin-generator] scope-config.json found (${fileContent.length} bytes)`);
        yield { type: 'scope_config' as ConversationEvent['type'], content: fileContent } as unknown as ConversationEvent;
      } else {
        // Strategy 2: Extract JSON from the conversation text
        console.log('[twin-generator] scope-config.json not found, extracting from conversation text...');
        const fullText = allTextBlocks.join('');
        const extracted = this.extractTwinConfigJson(fullText);
        if (extracted) {
          console.log(`[twin-generator] Extracted config from text (${extracted.length} bytes)`);
          yield { type: 'scope_config' as ConversationEvent['type'], content: extracted } as unknown as ConversationEvent;
        } else {
          console.warn('[twin-generator] Could not extract config from conversation text');
        }
      }
    } finally {
      rm(tempWorkspace, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Extract twin config JSON from conversation text.
   * Tries multiple strategies: direct parse, code fence extraction, brace matching.
   */
  private extractTwinConfigJson(text: string): string | null {
    if (!text || text.trim().length < 10) return null;

    console.log(`[twin-generator] Attempting to extract JSON from text (${text.length} chars). First 500 chars: ${text.slice(0, 500)}`);
    console.log(`[twin-generator] Last 500 chars: ${text.slice(-500)}`);

    // Strategy 1: Find JSON in code fences
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        const parsed = JSON.parse(fenceMatch[1]!.trim());
        if (parsed.systemPrompt || parsed.skills) return JSON.stringify(parsed);
      } catch { /* not valid JSON */ }
    }

    // Strategy 2: Find all top-level JSON objects and pick the one with systemPrompt/skills
    let depth = 0;
    let start = -1;
    const candidates: string[] = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          candidates.push(text.substring(start, i + 1));
          start = -1;
        }
      }
    }

    // Try candidates from largest to smallest
    candidates.sort((a, b) => b.length - a.length);
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed.systemPrompt || parsed.skills || (parsed.scope && parsed.systemPrompt !== undefined)) {
          return candidate;
        }
      } catch { continue; }
    }

    return null;
  }

  /**
   * Parse the generated JSON from Claude's response content blocks.
   */
  parseGeneratedConfig(contentBlocks: Array<{ type: string; text?: string }>): GeneratedScopeConfig {
    // Concatenate all text blocks
    const fullText = contentBlocks
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text!)
      .join('');

    // Try to extract JSON from the response
    let jsonStr = fullText.trim();

    // Strip markdown code fences if present
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1]!.trim();
    }

    // Try to find JSON object boundaries
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!parsed.scope || !parsed.agents || !Array.isArray(parsed.agents)) {
      throw new Error('Invalid generated config: missing scope or agents');
    }

    return parsed as GeneratedScopeConfig;
  }
}

export const scopeGeneratorService = new ScopeGeneratorService();
