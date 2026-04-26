/**
 * Node Executor Registry
 *
 * Central registry for all node executors. Dispatches execution to the
 * appropriate executor based on node type.
 *
 * Property 7: Node Type Execution Dispatch
 * For any node type, the node executor SHALL dispatch to the correct
 * type-specific handler.
 */

import type {
  INodeExecutor,
  NodeExecutionParams,
  NodeExecutionResult,
} from './types.js';
import type { CanvasNodeType } from '../../types/workflow-execution.js';

import { PassThroughNodeExecutor } from './pass-through-executor.js';
import { AgentNodeExecutor } from './agent-executor.js';
import { ConditionNodeExecutor } from './condition-executor.js';
import { ActionNodeExecutor } from './action-executor.js';
import { HumanApprovalNodeExecutor } from './human-approval-executor.js';
import { DocumentNodeExecutor } from './document-executor.js';
import { CodeArtifactNodeExecutor } from './code-artifact-executor.js';
import { IntentClassifierExecutor } from './intent-classifier-executor.js';
import { FaqLookupExecutor } from './faq-lookup-executor.js';
import { ChannelReplyExecutor } from './channel-reply-executor.js';

/**
 * Node Executor Registry
 *
 * Manages all node executors and dispatches execution requests
 * to the appropriate executor based on node type.
 */
export class NodeExecutorRegistry {
  private executors: INodeExecutor[] = [];
  private executorMap: Map<CanvasNodeType, INodeExecutor> = new Map();

  constructor() {
    // Register all executors
    this.registerExecutor(new PassThroughNodeExecutor());
    this.registerExecutor(new AgentNodeExecutor());
    this.registerExecutor(new ConditionNodeExecutor());
    this.registerExecutor(new ActionNodeExecutor());
    this.registerExecutor(new HumanApprovalNodeExecutor());
    this.registerExecutor(new DocumentNodeExecutor());
    this.registerExecutor(new CodeArtifactNodeExecutor());
    this.registerExecutor(new IntentClassifierExecutor());
    this.registerExecutor(new FaqLookupExecutor());
    this.registerExecutor(new ChannelReplyExecutor());
  }

  /**
   * Register a node executor
   */
  registerExecutor(executor: INodeExecutor): void {
    this.executors.push(executor);

    // Map each supported type to this executor
    for (const nodeType of executor.supportedTypes) {
      if (this.executorMap.has(nodeType)) {
        console.warn(
          `Overwriting executor for node type: ${nodeType}`
        );
      }
      this.executorMap.set(nodeType, executor);
    }
  }

  /**
   * Get executor for a node type
   */
  getExecutor(nodeType: CanvasNodeType): INodeExecutor | undefined {
    return this.executorMap.get(nodeType);
  }

  /**
   * Check if a node type is supported
   */
  isSupported(nodeType: CanvasNodeType): boolean {
    return this.executorMap.has(nodeType);
  }

  /**
   * Get all supported node types
   */
  getSupportedTypes(): CanvasNodeType[] {
    return Array.from(this.executorMap.keys());
  }

  /**
   * Execute a node
   *
   * Dispatches to the appropriate executor based on node type.
   * Returns a pass-through result for unknown node types.
   */
  async execute(params: NodeExecutionParams): Promise<NodeExecutionResult> {
    const nodeType = params.node.type;
    const executor = this.getExecutor(nodeType);

    if (!executor) {
      // Unknown node types pass through
      console.warn(
        `No executor found for node type: ${nodeType}, treating as pass-through`
      );
      return {
        success: true,
        output: {
          type: 'passThrough',
          nodeType,
          title: params.node.data.title,
          message: `Unknown node type: ${nodeType}`,
          timestamp: new Date().toISOString(),
        },
      };
    }

    return executor.execute(params);
  }

  /**
   * Get executor statistics
   */
  getStats(): {
    totalExecutors: number;
    supportedTypes: CanvasNodeType[];
    executorDetails: Array<{
      name: string;
      types: CanvasNodeType[];
    }>;
  } {
    return {
      totalExecutors: this.executors.length,
      supportedTypes: this.getSupportedTypes(),
      executorDetails: this.executors.map((executor) => ({
        name: executor.constructor.name,
        types: executor.supportedTypes,
      })),
    };
  }
}

// Singleton instance
export const nodeExecutorRegistry = new NodeExecutorRegistry();
