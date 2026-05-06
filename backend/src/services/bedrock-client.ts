/**
 * Shared Bedrock client factory.
 *
 * Centralizes credential selection so every call site follows the same
 * priority rules:
 *
 *   1. **Bedrock API Key** (`BEDROCK_API_KEY` / `AWS_BEARER_TOKEN_BEDROCK`)
 *      When set, the AWS SDK v3 auto-detects `AWS_BEARER_TOKEN_BEDROCK` and
 *      uses bearer-token auth. We explicitly propagate it into `process.env`
 *      so the SDK's env-var signer can pick it up, and we DO NOT pass any
 *      explicit credentials to the client — mixing `credentials` + bearer
 *      token causes the SDK to prefer SigV4.
 *
 *   2. **Explicit AK/SK** (`BEDROCK_AWS_*` > `AWS_*`)
 *      Falls back to classical SigV4 when no API key is set.
 *
 *   3. **Default provider chain**
 *      If neither is set, the client uses the SDK's default chain
 *      (EC2 instance role, ECS task role, environment credentials, etc.).
 *
 * Also exports a helper (`buildBedrockSubprocessEnv`) for services that
 * spawn subprocesses (e.g. Claude Code CLI) and need to propagate Bedrock
 * credentials via environment variables.
 */

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config/index.js';

interface CreateBedrockClientOptions {
  /**
   * Override region. Defaults to `config.bedrock.region` (i.e. `AWS_REGION`).
   * Pin this for services that require a specific region (e.g. Nova Canvas is
   * only available in `us-east-1`).
   */
  region?: string;
  /** Maximum SDK retry attempts. Default 3. */
  maxAttempts?: number;
}

/**
 * Create a BedrockRuntimeClient with the correct credentials based on the
 * project-wide priority rules. Safe to call multiple times — each call
 * returns a fresh client. Callers that need a singleton should cache the
 * result themselves.
 */
export function createBedrockClient(
  options: CreateBedrockClientOptions = {},
): BedrockRuntimeClient {
  const region = options.region ?? config.bedrock.region;
  const maxAttempts = options.maxAttempts ?? 3;

  // --- Priority 1: Bedrock API Key ---
  if (config.bedrock.apiKey) {
    // The AWS SDK v3 auto-detects AWS_BEARER_TOKEN_BEDROCK from process.env.
    // Ensure it's present without clobbering an already-set value.
    if (!process.env.AWS_BEARER_TOKEN_BEDROCK) {
      process.env.AWS_BEARER_TOKEN_BEDROCK = config.bedrock.apiKey;
    }
    // CRITICAL: force bearer auth to be tried FIRST. The SDK's default scheme
    // order for bedrock-runtime is [sigv4, httpBearerAuth]. On EC2/ECS, the
    // SigV4 credential chain resolves via IMDS (the instance role's temporary
    // creds) before bearer is ever attempted — and since auth scheme selection
    // happens ONCE at request-prep time (not on 403), the API Key is silently
    // ignored and requests go out signed by the instance role. Setting the
    // preference reorders bearer to the front.
    return new BedrockRuntimeClient({
      region,
      maxAttempts,
      authSchemePreference: ['httpBearerAuth'],
    });
  }

  // --- Priority 2: Explicit AK/SK ---
  const accessKeyId = config.bedrock.accessKeyId;
  const secretAccessKey = config.bedrock.secretAccessKey;
  if (accessKeyId && secretAccessKey) {
    return new BedrockRuntimeClient({
      region,
      maxAttempts,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  // --- Priority 3: Default provider chain ---
  return new BedrockRuntimeClient({ region, maxAttempts });
}

/**
 * Build the Bedrock-related environment variables to inject into a
 * subprocess (e.g. Claude Code CLI). Applies the same priority rules as
 * `createBedrockClient`.
 *
 * Callers are expected to merge the returned object into the subprocess
 * env alongside `CLAUDE_CODE_USE_BEDROCK=1` etc.
 *
 * When an API key is present, this function intentionally omits
 * `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — leaving them would cause
 * the SDK/CLI to prefer SigV4 over bearer-token auth.
 */
export function buildBedrockSubprocessEnv(): Record<string, string> {
  const env: Record<string, string> = {
    AWS_REGION: config.bedrock.region,
    AWS_DEFAULT_REGION: config.bedrock.region,
  };

  if (config.bedrock.apiKey) {
    env.AWS_BEARER_TOKEN_BEDROCK = config.bedrock.apiKey;
    // Same reason as in createBedrockClient: without this, subprocesses
    // running the AWS Node SDK would still try SigV4 (via IMDS) first and
    // silently ignore the bearer token.
    env.AWS_AUTH_SCHEME_PREFERENCE = 'httpBearerAuth';
    return env;
  }

  if (config.bedrock.accessKeyId) {
    env.AWS_ACCESS_KEY_ID = config.bedrock.accessKeyId;
  }
  if (config.bedrock.secretAccessKey) {
    env.AWS_SECRET_ACCESS_KEY = config.bedrock.secretAccessKey;
  }
  return env;
}

/**
 * @returns `true` if a Bedrock API Key is configured.
 */
export function hasBedrockApiKey(): boolean {
  return !!config.bedrock.apiKey;
}
