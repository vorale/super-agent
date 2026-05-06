#!/usr/bin/env python3
"""Generate base .env file for CI/CD deployment."""
import argparse

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--redis-host', required=True)
    p.add_argument('--redis-port', required=True)
    p.add_argument('--aws-region', required=True)
    p.add_argument('--avatar-bucket', required=True)
    p.add_argument('--skills-bucket', required=True)
    p.add_argument('--workspace-bucket', required=True)
    p.add_argument('--app-url', required=True)
    p.add_argument('--database-url', required=True)
    p.add_argument('--bedrock-api-key', default='',
                   help='Optional Bedrock API Key (bearer token). '
                        'Takes priority over AWS_ACCESS_KEY_ID/SECRET for Bedrock calls.')
    p.add_argument('--output', required=True)
    args = p.parse_args()

    lines = [
        'PORT=3000',
        'HOST=0.0.0.0',
        'NODE_ENV=production',
        'LOG_LEVEL=info',
        f'REDIS_HOST={args.redis_host}',
        f'REDIS_PORT={args.redis_port}',
        'REDIS_PASSWORD=',
        'AUTH_MODE=local',
        f'AWS_REGION={args.aws_region}',
        f'S3_BUCKET_NAME={args.avatar_bucket}',
        'S3_PRESIGNED_URL_EXPIRES=3600',
        f'SKILLS_S3_BUCKET={args.skills_bucket}',
        f'CORS_ORIGIN={args.app_url}',
        f'APP_URL={args.app_url}',
        'CLAUDE_CODE_USE_BEDROCK=1',
        'CLAUDE_MODEL=us.anthropic.claude-opus-4-6-v1',
        'AGENT_WORKSPACE_BASE_DIR=/opt/super-agent/workspaces',
        'AGENT_RUNTIME=claude',
        f'AGENTCORE_WORKSPACE_S3_BUCKET={args.workspace_bucket}',
        f'DATABASE_URL={args.database_url}',
    ]

    if args.bedrock_api_key:
        lines.append(f'BEDROCK_API_KEY={args.bedrock_api_key}')

    with open(args.output, 'w') as f:
        f.write('\n'.join(lines) + '\n')

    print(f'Wrote {len(lines)} env vars to {args.output}')

if __name__ == '__main__':
    main()
