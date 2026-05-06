/**
 * Property-based tests for Claude Configuration
 *
 * Feature: claude-agent-sdk-chat
 * Property 12: Credential validation
 * Property 13: Model ID mapping correctness
 * Validates: Requirements 7.3, 7.4
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ANTHROPIC_TO_BEDROCK_MODEL_MAP,
  getBedrockModelId,
  validateClaudeCredentials,
  type ClaudeCredentialConfig,
} from '../../src/utils/claude-config.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a non-empty, non-whitespace-only string (valid credential value). */
const nonEmptyNonWhitespaceString = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/** Generates a string that is empty or whitespace-only (invalid credential value). */
const emptyOrWhitespaceString = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t'),
  fc.constant(' \n '),
);

/** Generates a known Anthropic model ID from the mapping table. */
const knownModelIdArb = fc.constantFrom(
  ...Object.keys(ANTHROPIC_TO_BEDROCK_MODEL_MAP),
);

/**
 * Generates a model ID that is NOT in the mapping table.
 * Uses a prefix that cannot collide with known keys.
 */
const unknownModelIdArb = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => !(s in ANTHROPIC_TO_BEDROCK_MODEL_MAP));

// ---------------------------------------------------------------------------
// Property 12: Credential validation
// ---------------------------------------------------------------------------

describe('Property 12: Credential validation', () => {
  /**
   * **Validates: Requirements 7.3**
   *
   * For any environment configuration, the validation SHALL pass if and only if
   * either ANTHROPIC_API_KEY is a non-empty string, or all three of
   * AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION are non-empty
   * strings with CLAUDE_CODE_USE_BEDROCK set to "true".
   */

  it('should PASS when ANTHROPIC_API_KEY is a non-empty, non-whitespace string', () => {
    fc.assert(
      fc.property(nonEmptyNonWhitespaceString, (apiKey) => {
        const config: ClaudeCredentialConfig = { anthropicApiKey: apiKey };
        const result = validateClaudeCredentials(config);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('should PASS when Bedrock is enabled with all three valid AWS credentials', () => {
    fc.assert(
      fc.property(
        nonEmptyNonWhitespaceString,
        nonEmptyNonWhitespaceString,
        nonEmptyNonWhitespaceString,
        (accessKeyId, secretAccessKey, region) => {
          const config: ClaudeCredentialConfig = {
            claudeCodeUseBedrock: 'true',
            awsAccessKeyId: accessKeyId,
            awsSecretAccessKey: secretAccessKey,
            awsRegion: region,
          };
          const result = validateClaudeCredentials(config);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should PASS when ANTHROPIC_API_KEY is valid regardless of Bedrock settings', () => {
    fc.assert(
      fc.property(
        nonEmptyNonWhitespaceString,
        fc.option(fc.constantFrom('true', 'false', undefined), { nil: undefined }),
        fc.option(fc.string(), { nil: undefined }),
        fc.option(fc.string(), { nil: undefined }),
        fc.option(fc.string(), { nil: undefined }),
        (apiKey, bedrockFlag, accessKeyId, secretAccessKey, region) => {
          const config: ClaudeCredentialConfig = {
            anthropicApiKey: apiKey,
            claudeCodeUseBedrock: bedrockFlag,
            awsAccessKeyId: accessKeyId,
            awsSecretAccessKey: secretAccessKey,
            awsRegion: region,
          };
          const result = validateClaudeCredentials(config);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should FAIL when no credentials are provided at all', () => {
    fc.assert(
      fc.property(
        fc.constant({}),
        (config: ClaudeCredentialConfig) => {
          const result = validateClaudeCredentials(config);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        },
      ),
      { numRuns: 1 },
    );
  });

  it('should FAIL when ANTHROPIC_API_KEY is empty/whitespace and Bedrock is not enabled', () => {
    fc.assert(
      fc.property(
        emptyOrWhitespaceString,
        fc.option(fc.constantFrom('false', 'FALSE', 'no', '0', ''), { nil: undefined }),
        (apiKey, bedrockFlag) => {
          const config: ClaudeCredentialConfig = {
            anthropicApiKey: apiKey,
            claudeCodeUseBedrock: bedrockFlag,
          };
          const result = validateClaudeCredentials(config);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should FAIL when Bedrock is enabled but at least one AWS credential is missing or empty', () => {
    // Generate configs where at least one of the three AWS creds is invalid
    const atLeastOneBadCredArb = fc
      .tuple(
        fc.oneof(emptyOrWhitespaceString, fc.constant(undefined)),
        fc.oneof(nonEmptyNonWhitespaceString, emptyOrWhitespaceString, fc.constant(undefined)),
        fc.oneof(nonEmptyNonWhitespaceString, emptyOrWhitespaceString, fc.constant(undefined)),
      )
      .chain(([a, b, c]) => {
        // Shuffle which position gets the bad value
        return fc.constantFrom(
          [a, b, c] as const,
          [b, a, c] as const,
          [c, b, a] as const,
        );
      })
      .filter(([accessKeyId, secretAccessKey, region]) => {
        // Ensure at least one is invalid (empty, whitespace, or undefined)
        const isInvalid = (v: string | undefined) =>
          v === undefined || v.trim().length === 0;
        return (
          isInvalid(accessKeyId) ||
          isInvalid(secretAccessKey) ||
          isInvalid(region)
        );
      });

    fc.assert(
      fc.property(atLeastOneBadCredArb, ([accessKeyId, secretAccessKey, region]) => {
        const config: ClaudeCredentialConfig = {
          claudeCodeUseBedrock: 'true',
          awsAccessKeyId: accessKeyId,
          awsSecretAccessKey: secretAccessKey,
          awsRegion: region,
        };
        const result = validateClaudeCredentials(config);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('CLAUDE_CODE_USE_BEDROCK');
      }),
      { numRuns: 100 },
    );
  });

  it('should FAIL when Bedrock is not "true" even with valid AWS credentials', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('false', 'FALSE', 'True', 'TRUE', 'yes', ''),
        nonEmptyNonWhitespaceString,
        nonEmptyNonWhitespaceString,
        nonEmptyNonWhitespaceString,
        (bedrockFlag, accessKeyId, secretAccessKey, region) => {
          const config: ClaudeCredentialConfig = {
            claudeCodeUseBedrock: bedrockFlag,
            awsAccessKeyId: accessKeyId,
            awsSecretAccessKey: secretAccessKey,
            awsRegion: region,
          };
          const result = validateClaudeCredentials(config);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -----------------------------------------------------------------------
  // Bedrock API Key path
  // -----------------------------------------------------------------------

  it('should PASS when Bedrock is enabled with a valid BEDROCK_API_KEY and AWS_REGION', () => {
    fc.assert(
      fc.property(
        nonEmptyNonWhitespaceString,
        nonEmptyNonWhitespaceString,
        (apiKey, region) => {
          const config: ClaudeCredentialConfig = {
            claudeCodeUseBedrock: 'true',
            bedrockApiKey: apiKey,
            awsRegion: region,
          };
          const result = validateClaudeCredentials(config);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should PASS with BEDROCK_API_KEY even when AK/SK are missing or empty', () => {
    fc.assert(
      fc.property(
        nonEmptyNonWhitespaceString,
        nonEmptyNonWhitespaceString,
        fc.option(emptyOrWhitespaceString, { nil: undefined }),
        fc.option(emptyOrWhitespaceString, { nil: undefined }),
        (apiKey, region, accessKeyId, secretAccessKey) => {
          const config: ClaudeCredentialConfig = {
            claudeCodeUseBedrock: 'true',
            bedrockApiKey: apiKey,
            awsAccessKeyId: accessKeyId,
            awsSecretAccessKey: secretAccessKey,
            awsRegion: region,
          };
          const result = validateClaudeCredentials(config);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should FAIL when BEDROCK_API_KEY is set but AWS_REGION is missing or empty', () => {
    fc.assert(
      fc.property(
        nonEmptyNonWhitespaceString,
        fc.oneof(emptyOrWhitespaceString, fc.constant(undefined)),
        (apiKey, region) => {
          const config: ClaudeCredentialConfig = {
            claudeCodeUseBedrock: 'true',
            bedrockApiKey: apiKey,
            awsRegion: region,
          };
          const result = validateClaudeCredentials(config);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should FAIL when BEDROCK_API_KEY is empty/whitespace even with valid region', () => {
    fc.assert(
      fc.property(
        emptyOrWhitespaceString,
        nonEmptyNonWhitespaceString,
        (apiKey, region) => {
          const config: ClaudeCredentialConfig = {
            claudeCodeUseBedrock: 'true',
            bedrockApiKey: apiKey,
            awsRegion: region,
          };
          const result = validateClaudeCredentials(config);
          // Should FAIL unless AK/SK fall back and are valid (they aren't here)
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Model ID mapping correctness
// ---------------------------------------------------------------------------

describe('Property 13: Model ID mapping correctness', () => {
  /**
   * **Validates: Requirements 7.4**
   *
   * For any Anthropic model ID that exists in the mapping table, when
   * CLAUDE_CODE_USE_BEDROCK is enabled, the mapped Bedrock model ID SHALL be
   * the corresponding value from the mapping. For any model ID NOT in the
   * mapping table, the original ID SHALL be returned unchanged.
   */

  it('should return the mapped Bedrock ID for any known Anthropic model ID', () => {
    fc.assert(
      fc.property(knownModelIdArb, (modelId) => {
        const result = getBedrockModelId(modelId);
        expect(result).toBe(ANTHROPIC_TO_BEDROCK_MODEL_MAP[modelId]);
        // The result should differ from the input (mapping changes the ID)
        expect(result).not.toBe(modelId);
      }),
      { numRuns: 100 },
    );
  });

  it('should return the original ID unchanged for any model ID NOT in the mapping', () => {
    fc.assert(
      fc.property(unknownModelIdArb, (modelId) => {
        const result = getBedrockModelId(modelId);
        expect(result).toBe(modelId);
      }),
      { numRuns: 100 },
    );
  });

  it('should be idempotent for unknown model IDs: mapping twice yields the same result', () => {
    fc.assert(
      fc.property(unknownModelIdArb, (modelId) => {
        const first = getBedrockModelId(modelId);
        const second = getBedrockModelId(first);
        expect(second).toBe(first);
      }),
      { numRuns: 100 },
    );
  });

  it('should map every entry in the mapping table to a distinct Bedrock ID', () => {
    // This is a structural property: no two Anthropic IDs map to the same Bedrock ID
    const entries = Object.entries(ANTHROPIC_TO_BEDROCK_MODEL_MAP);
    const bedrockIds = entries.map(([, v]) => v);
    const uniqueBedrockIds = new Set(bedrockIds);
    expect(uniqueBedrockIds.size).toBe(bedrockIds.length);
  });

  it('should return the original ID for the empty string', () => {
    expect(getBedrockModelId('')).toBe('');
  });
});
