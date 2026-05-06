import { describe, it, expect } from 'vitest';
import {
  ANTHROPIC_TO_BEDROCK_MODEL_MAP,
  getBedrockModelId,
  validateClaudeCredentials,
  type ClaudeCredentialConfig,
} from '../../src/utils/claude-config.js';

describe('claude-config', () => {
  describe('ANTHROPIC_TO_BEDROCK_MODEL_MAP', () => {
    it('should contain mapping for claude-sonnet-4-5-20250929', () => {
      expect(ANTHROPIC_TO_BEDROCK_MODEL_MAP['claude-sonnet-4-5-20250929']).toBe(
        'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      );
    });

    it('should contain mapping for claude-haiku-4-5-20251001', () => {
      expect(ANTHROPIC_TO_BEDROCK_MODEL_MAP['claude-haiku-4-5-20251001']).toBe(
        'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      );
    });
  });

  describe('getBedrockModelId', () => {
    it('should return the Bedrock model ID for a known Anthropic model', () => {
      expect(getBedrockModelId('claude-sonnet-4-5-20250929')).toBe(
        'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      );
    });

    it('should return the Bedrock model ID for claude-haiku', () => {
      expect(getBedrockModelId('claude-haiku-4-5-20251001')).toBe(
        'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      );
    });

    it('should return the original ID for an unknown model', () => {
      expect(getBedrockModelId('some-unknown-model')).toBe('some-unknown-model');
    });

    it('should return the original ID for an empty string', () => {
      expect(getBedrockModelId('')).toBe('');
    });
  });

  describe('validateClaudeCredentials', () => {
    it('should pass when ANTHROPIC_API_KEY is set', () => {
      const config: ClaudeCredentialConfig = {
        anthropicApiKey: 'sk-ant-test-key',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should pass when Bedrock credentials are complete', () => {
      const config: ClaudeCredentialConfig = {
        claudeCodeUseBedrock: 'true',
        awsAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        awsRegion: 'us-east-1',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should pass when both Anthropic key and Bedrock credentials are present', () => {
      const config: ClaudeCredentialConfig = {
        anthropicApiKey: 'sk-ant-test-key',
        claudeCodeUseBedrock: 'true',
        awsAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        awsRegion: 'us-east-1',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(true);
    });

    it('should fail when no credentials are provided', () => {
      const config: ClaudeCredentialConfig = {};
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail when Bedrock is enabled but AWS_ACCESS_KEY_ID is missing', () => {
      const config: ClaudeCredentialConfig = {
        claudeCodeUseBedrock: 'true',
        awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        awsRegion: 'us-east-1',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('AWS_ACCESS_KEY_ID');
    });

    it('should fail when Bedrock is enabled but AWS_SECRET_ACCESS_KEY is missing', () => {
      const config: ClaudeCredentialConfig = {
        claudeCodeUseBedrock: 'true',
        awsAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        awsRegion: 'us-east-1',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('AWS_SECRET_ACCESS_KEY');
    });

    it('should fail when Bedrock is enabled but AWS_REGION is missing', () => {
      const config: ClaudeCredentialConfig = {
        claudeCodeUseBedrock: 'true',
        awsAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('AWS_REGION');
    });

    it('should fail when ANTHROPIC_API_KEY is an empty string', () => {
      const config: ClaudeCredentialConfig = {
        anthropicApiKey: '',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(false);
    });

    it('should fail when ANTHROPIC_API_KEY is whitespace only', () => {
      const config: ClaudeCredentialConfig = {
        anthropicApiKey: '   ',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(false);
    });

    it('should fail when Bedrock is enabled but AWS credentials are whitespace', () => {
      const config: ClaudeCredentialConfig = {
        claudeCodeUseBedrock: 'true',
        awsAccessKeyId: '  ',
        awsSecretAccessKey: '  ',
        awsRegion: '  ',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(false);
    });

    it('should fail when CLAUDE_CODE_USE_BEDROCK is not "true"', () => {
      const config: ClaudeCredentialConfig = {
        claudeCodeUseBedrock: 'false',
        awsAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        awsRegion: 'us-east-1',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(false);
    });

    it('should list all missing AWS credentials in error message', () => {
      const config: ClaudeCredentialConfig = {
        claudeCodeUseBedrock: 'true',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('AWS_ACCESS_KEY_ID');
      expect(result.error).toContain('AWS_SECRET_ACCESS_KEY');
      expect(result.error).toContain('AWS_REGION');
    });

    // --------- Bedrock API Key path ---------

    it('should pass with Bedrock API Key + AWS_REGION (no AK/SK needed)', () => {
      const config: ClaudeCredentialConfig = {
        claudeCodeUseBedrock: 'true',
        bedrockApiKey: 'ABSKQmVkcm9ja0FQSUtleS1kZW1v',
        awsRegion: 'us-east-1',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should pass with Bedrock API Key + AWS_REGION even when AK/SK are empty', () => {
      const config: ClaudeCredentialConfig = {
        claudeCodeUseBedrock: 'true',
        bedrockApiKey: 'ABSKQmVkcm9ja0FQSUtleS1kZW1v',
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        awsRegion: 'us-east-1',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(true);
    });

    it('should pass with Bedrock API Key when CLAUDE_CODE_USE_BEDROCK="1"', () => {
      const config: ClaudeCredentialConfig = {
        claudeCodeUseBedrock: '1',
        bedrockApiKey: 'ABSKQmVkcm9ja0FQSUtleS1kZW1v',
        awsRegion: 'us-west-2',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(true);
    });

    it('should fail when Bedrock API Key is set but AWS_REGION is missing', () => {
      const config: ClaudeCredentialConfig = {
        claudeCodeUseBedrock: 'true',
        bedrockApiKey: 'ABSKQmVkcm9ja0FQSUtleS1kZW1v',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('AWS_REGION');
    });

    it('should fail when Bedrock API Key is whitespace-only', () => {
      const config: ClaudeCredentialConfig = {
        claudeCodeUseBedrock: 'true',
        bedrockApiKey: '   ',
        awsRegion: 'us-east-1',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(false);
    });

    it('should fail when CLAUDE_CODE_USE_BEDROCK is not enabled even with valid API Key', () => {
      const config: ClaudeCredentialConfig = {
        claudeCodeUseBedrock: 'false',
        bedrockApiKey: 'ABSKQmVkcm9ja0FQSUtleS1kZW1v',
        awsRegion: 'us-east-1',
      };
      const result = validateClaudeCredentials(config);
      expect(result.valid).toBe(false);
    });
  });
});
