/**
 * AI Service
 * Provides AI-powered agent generation and chat using AWS Bedrock Nova.
 */

import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { createBedrockClient } from './bedrock-client.js';

// Model ID for Amazon Nova 2 Lite
const NOVA_MODEL_ID = 'us.amazon.nova-2-lite-v1:0';

/**
 * Suggested tool with skill definition (inspired by Claude Skills format)
 */
export interface SuggestedTool {
  name: string;           // kebab-case identifier
  display_name: string;   // Human-readable name
  description: string;    // Brief description for discovery
  skill_md: string;       // Full skill.md content with instructions
}

/**
 * Suggested agent role from AI analysis (not persisted)
 */
export interface SuggestedAgentRole {
  name: string;
  display_name: string;
  role: string;
  description: string;
  responsibilities: string[];
  capabilities: string[];
  system_prompt: string;
  suggested_tools: SuggestedTool[];
}

/**
 * Input for agent suggestion
 */
export interface SuggestAgentsInput {
  business_scope_name: string;
  business_scope_description?: string;
  document_contents?: string[];
  agent_count?: number;
}

/**
 * Chat message for conversation
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Input for chat completion
 */
export interface ChatCompletionInput {
  system_prompt?: string;
  messages: ChatMessage[];
  max_tokens?: number;
}

// Initialize Bedrock client via shared factory (applies API Key > AK/SK > default chain).
const bedrockClient = createBedrockClient();

/**
 * Generates the prompt for agent suggestion
 */
function buildAgentSuggestionPrompt(input: SuggestAgentsInput): string {
  const agentCount = input.agent_count || 5;
  
  let prompt = `You are an expert AI system architect. Analyze the following business domain and suggest ${agentCount} AI agent roles that would be most valuable for automating and assisting with tasks in this domain.

Business Domain: ${input.business_scope_name}
`;

  if (input.business_scope_description) {
    prompt += `\nDescription: ${input.business_scope_description}`;
  }

  if (input.document_contents && input.document_contents.length > 0) {
    prompt += `\n\nReference Documents:\n`;
    input.document_contents.forEach((content, index) => {
      // Truncate each document to avoid token limits
      const truncated = content.substring(0, 2000);
      prompt += `\n--- Document ${index + 1} ---\n${truncated}\n`;
    });
  }

  prompt += `

For each agent role, provide:
1. name: A kebab-case identifier (e.g., "risk-analyst", "data-engineer")
2. display_name: Human-readable name (can be in Chinese if the business domain is Chinese)
3. role: Job title/role description
4. description: Brief description of what this agent does (1-2 sentences)
5. responsibilities: Array of 3-5 core responsibilities
6. capabilities: Array of 3-5 key capabilities/skills
7. system_prompt: A detailed system prompt for this agent (2-3 sentences describing their expertise and how they should behave)
8. suggested_tools: Array of 2-4 tool/skill objects. Each tool should have:
   - name: kebab-case identifier (e.g., "risk-assessment", "data-analysis")
   - display_name: Human-readable name (can be in Chinese if domain is Chinese)
   - description: Brief description for tool discovery (1 sentence)
   - skill_md: Detailed skill instructions in Markdown format. This should include:
     * What the skill does
     * When to use it
     * Step-by-step instructions for execution
     * Expected inputs and outputs
     * Best practices and constraints

IMPORTANT: 
- If the business domain name is in Chinese, use Chinese for display_name, role, description, responsibilities, capabilities, system_prompt, and tool display_name/description/skill_md
- The "name" field must always be in English kebab-case
- The tool "name" field must always be in English kebab-case
- Return ONLY valid JSON array, no markdown, no explanation

Example output format:
[
  {
    "name": "risk-analyst",
    "display_name": "风险分析师",
    "role": "风险评估与分析",
    "description": "负责识别、评估和监控业务风险",
    "responsibilities": ["风险识别", "风险评估", "风险监控", "报告生成"],
    "capabilities": ["数据分析", "风险建模", "预测分析"],
    "system_prompt": "你是一名专业的风险分析师，擅长识别和评估各类业务风险。你应该基于数据进行客观分析，并提供可行的风险缓解建议。",
    "suggested_tools": [
      {
        "name": "risk-assessment",
        "display_name": "风险评估",
        "description": "评估业务风险等级和影响范围",
        "skill_md": "# 风险评估技能\\n\\n## 概述\\n此技能用于系统性评估业务风险。\\n\\n## 使用场景\\n- 新业务上线前的风险评估\\n- 定期风险审查\\n- 异常事件风险分析\\n\\n## 执行步骤\\n1. 收集相关业务数据和历史记录\\n2. 识别潜在风险因素\\n3. 评估风险发生概率和影响程度\\n4. 计算风险等级（高/中/低）\\n5. 生成风险评估报告\\n\\n## 输入\\n- 业务数据\\n- 历史风险记录\\n- 行业基准数据\\n\\n## 输出\\n- 风险等级评定\\n- 风险因素清单\\n- 缓解建议\\n\\n## 最佳实践\\n- 使用量化指标进行评估\\n- 考虑多维度风险因素\\n- 定期更新风险模型"
      },
      {
        "name": "data-analysis",
        "display_name": "数据分析",
        "description": "分析业务数据以发现趋势和异常",
        "skill_md": "# 数据分析技能\\n\\n## 概述\\n此技能用于分析业务数据，发现趋势、模式和异常。\\n\\n## 使用场景\\n- 业务指标分析\\n- 趋势预测\\n- 异常检测\\n\\n## 执行步骤\\n1. 数据收集和清洗\\n2. 探索性数据分析\\n3. 统计分析和建模\\n4. 可视化呈现\\n5. 生成分析报告\\n\\n## 输入\\n- 原始业务数据\\n- 分析目标和维度\\n\\n## 输出\\n- 数据分析报告\\n- 可视化图表\\n- 关键发现和建议"
      }
    ]
  }
]

Now generate ${agentCount} agent roles for the business domain "${input.business_scope_name}":`;

  return prompt;
}

/**
 * Parses the AI response to extract agent roles
 */
function parseAgentRolesResponse(responseText: string): SuggestedAgentRole[] {
  // Try to extract JSON from the response
  let jsonStr = responseText.trim();
  
  // Remove markdown code blocks if present
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  // Sanitize control characters that LLMs sometimes emit inside JSON string values
  jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, (ch: string) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    return '';
  });

  const parsed = JSON.parse(jsonStr);
  
  if (!Array.isArray(parsed)) {
    throw new Error('Response is not an array');
  }

  // Validate and normalize each role
  return parsed.map((role: unknown, index: number) => {
    const r = role as Record<string, unknown>;
    
    // Parse suggested_tools - handle both old format (string[]) and new format (object[])
    let suggestedTools: SuggestedTool[] = [];
    if (Array.isArray(r.suggested_tools)) {
      suggestedTools = r.suggested_tools.map((tool: unknown, toolIndex: number) => {
        // Handle old format: just a string name
        if (typeof tool === 'string') {
          return {
            name: tool,
            display_name: tool.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            description: '',
            skill_md: `# ${tool}\n\nThis skill provides ${tool.replace(/-/g, ' ')} capabilities.`,
          };
        }
        // Handle new format: full object
        const t = tool as Record<string, unknown>;
        return {
          name: String(t.name || `tool-${toolIndex + 1}`),
          display_name: String(t.display_name || t.name || `Tool ${toolIndex + 1}`),
          description: String(t.description || ''),
          skill_md: String(t.skill_md || ''),
        };
      });
    }
    
    return {
      name: String(r.name || `agent-${index + 1}`),
      display_name: String(r.display_name || r.name || `Agent ${index + 1}`),
      role: String(r.role || ''),
      description: String(r.description || ''),
      responsibilities: Array.isArray(r.responsibilities) 
        ? r.responsibilities.map(String) 
        : [],
      capabilities: Array.isArray(r.capabilities) 
        ? r.capabilities.map(String) 
        : [],
      system_prompt: String(r.system_prompt || ''),
      suggested_tools: suggestedTools,
    };
  });
}

/**
 * AI Service class for agent generation
 */
export class AIService {
  /**
   * Suggests agent roles using AI based on business scope.
   * This does NOT persist anything - just returns suggestions.
   * Throws error if AI call fails - no fallback.
   */
  async suggestAgentRoles(input: SuggestAgentsInput): Promise<SuggestedAgentRole[]> {
    try {
      const prompt = buildAgentSuggestionPrompt(input);
      
      const command = new InvokeModelCommand({
        modelId: NOVA_MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: [{ text: prompt }],
            },
          ],
          inferenceConfig: {
            max_new_tokens: 4096,
            temperature: 0.7,
          },
        }),
      });

      const response = await bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      if (!responseBody.output || !responseBody.output.message || !responseBody.output.message.content || !responseBody.output.message.content[0]) {
        throw new Error('Invalid response structure from Bedrock');
      }

      const responseText = responseBody.output.message.content[0].text;
      return parseAgentRolesResponse(responseText);
    } catch (error) {
      console.error('Error in suggestAgentRoles:', error);
      
      // Check if it's an AWS credentials error
      if (error instanceof Error && (
        error.message.includes('credentials') ||
        error.message.includes('Missing credentials') ||
        error.name === 'CredentialsProviderError'
      )) {
        throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file or configure AWS credentials.');
      }
      
      throw new Error(`Failed to generate agent suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Suggests a single agent from a conversational description.
   * Used for dynamic agent creation in chat rooms or standalone.
   */
  async suggestAgentFromConversation(input: {
    description: string;
    businessScopeName?: string;
    businessScopeDescription?: string;
    existingAgentRoles?: string[];
    conversationHistory?: ChatMessage[];
  }): Promise<{ suggested_agent: SuggestedAgentRole; follow_up_questions: string[]; confidence: number }> {
    let prompt = `You are an AI team architect. Based on the user's description, design a single AI assistant role.

`;
    if (input.businessScopeName) {
      prompt += `Current business domain: ${input.businessScopeName}`;
      if (input.businessScopeDescription) prompt += ` (${input.businessScopeDescription})`;
      prompt += '\n';
    }
    if (input.existingAgentRoles && input.existingAgentRoles.length > 0) {
      prompt += `Existing roles in the team: ${input.existingAgentRoles.join(', ')}\n`;
      prompt += `Design a role that complements (does not duplicate) the existing roles.\n`;
    }
    prompt += `\nUser's request: ${input.description}\n`;

    if (input.conversationHistory && input.conversationHistory.length > 0) {
      prompt += `\nConversation context:\n`;
      for (const msg of input.conversationHistory.slice(-10)) {
        prompt += `${msg.role}: ${msg.content}\n`;
      }
    }

    prompt += `
If the description is clear enough, generate the role. If not, provide 1-2 clarifying questions.

Return ONLY valid JSON (no markdown):
{
  "suggested_agent": {
    "name": "kebab-case-english-id",
    "display_name": "Human readable name (Chinese if domain is Chinese)",
    "role": "Job title",
    "description": "1-2 sentence description",
    "responsibilities": ["resp1", "resp2", "resp3"],
    "capabilities": ["cap1", "cap2", "cap3"],
    "system_prompt": "Detailed system prompt for this agent",
    "suggested_tools": []
  },
  "follow_up_questions": [],
  "confidence": 0.85
}`;

    const command = new InvokeModelCommand({
      modelId: NOVA_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        inferenceConfig: { max_new_tokens: 2048, temperature: 0.7 },
      }),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    if (!responseBody.output?.message?.content?.[0]) {
      throw new Error('Invalid response structure from Bedrock');
    }

    let jsonStr = responseBody.output.message.content[0].text.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);

    // Sanitize control characters that LLMs sometimes emit inside JSON string values
    jsonStr = jsonStr.trim().replace(/[\x00-\x1F\x7F]/g, (ch: string) => {
      if (ch === '\n') return '\\n';
      if (ch === '\r') return '\\r';
      if (ch === '\t') return '\\t';
      return '';
    });

    const parsed = JSON.parse(jsonStr);
    const agent = parsed.suggested_agent;

    return {
      suggested_agent: {
        name: String(agent?.name || 'new-agent'),
        display_name: String(agent?.display_name || 'New Agent'),
        role: String(agent?.role || ''),
        description: String(agent?.description || ''),
        responsibilities: Array.isArray(agent?.responsibilities) ? agent.responsibilities.map(String) : [],
        capabilities: Array.isArray(agent?.capabilities) ? agent.capabilities.map(String) : [],
        system_prompt: String(agent?.system_prompt || ''),
        suggested_tools: Array.isArray(agent?.suggested_tools) ? agent.suggested_tools.map((t: Record<string, unknown>) => ({
          name: String(t.name || ''),
          display_name: String(t.display_name || ''),
          description: String(t.description || ''),
          skill_md: String(t.skill_md || ''),
        })) : [],
      },
      follow_up_questions: Array.isArray(parsed.follow_up_questions) ? parsed.follow_up_questions.map(String) : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  }

  /**
   * Generates a chat completion using Claude.
   * Used for agent chat conversations.
   */
  async chatCompletion(input: ChatCompletionInput): Promise<string> {
    const command = new InvokeModelCommand({
      modelId: NOVA_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        messages: input.messages.map(msg => ({
          role: msg.role,
          content: [{ text: msg.content }],
        })),
        system: input.system_prompt ? [{ text: input.system_prompt }] : undefined,
        inferenceConfig: {
          max_new_tokens: input.max_tokens || 2048,
          temperature: 0.7,
        },
      }),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    if (!responseBody.output || !responseBody.output.message || !responseBody.output.message.content || !responseBody.output.message.content[0]) {
      throw new Error('Invalid response structure from Bedrock');
    }

    return responseBody.output.message.content[0].text;
  }
}

// Export singleton instance
export const aiService = new AIService();
