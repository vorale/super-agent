/**
 * Bedrock Embedder — generates text embeddings using Amazon Nova Multimodal Embeddings.
 *
 * Model: amazon.nova-2-multimodal-embeddings-v1:0
 * Dimensions: 1024 (configurable: 256, 384, 1024, 3072)
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config/index.js';
import { createBedrockClient } from './bedrock-client.js';

const MODEL_ID = 'amazon.nova-2-multimodal-embeddings-v1:0';
const EMBEDDING_DIMENSION = 1024;

// Shared Bedrock client (API Key > AK/SK > default provider chain).
const bedrockClient: BedrockRuntimeClient = createBedrockClient({ region: config.aws.region });

export async function embedText(text: string): Promise<number[]> {
  const body = {
    taskType: 'SINGLE_EMBEDDING',
    singleEmbeddingParams: {
      embeddingPurpose: 'GENERIC_INDEX',
      embeddingDimension: EMBEDDING_DIMENSION,
      text: { truncationMode: 'END', value: text.slice(0, 8000) },
    },
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  });

  const response = await bedrockClient.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));

  const embedding: number[] | undefined = result?.embeddings?.[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Unexpected embedding response: got ${embedding?.length ?? 0} dims, expected ${EMBEDDING_DIMENSION}`);
  }

  return embedding;
}

export { EMBEDDING_DIMENSION };
