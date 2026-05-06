# Super Agent Backend

## AWS Bedrock Configuration

The backend uses AWS Bedrock (Claude, Nova) for AI-powered agent generation,
conversation, embedding, rehearsal, and image generation. The project supports
two authentication methods for Bedrock, with a clear priority order.

### Authentication priority

When the backend calls Bedrock (directly or via the Claude Code CLI subprocess),
it resolves credentials in this order:

1. **`BEDROCK_API_KEY`** (or `AWS_BEARER_TOKEN_BEDROCK`) — a Bedrock bearer token.
   When set, the AWS SDK v3 uses bearer-token auth instead of SigV4, and no AK/SK
   is needed for Bedrock calls. Other AWS services (S3, Cognito, etc.) still
   use their own credentials.
2. **`BEDROCK_AWS_ACCESS_KEY_ID` + `BEDROCK_AWS_SECRET_ACCESS_KEY`** — dedicated
   Bedrock AK/SK (useful for cross-account Bedrock access).
3. **`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`** — shared account credentials.
4. **Default provider chain** — EC2 instance role, ECS task role, `~/.aws/credentials`.

`AWS_REGION` is always required.

### Option 1: Bedrock API Key (recommended)

Generate a Bedrock API Key in the AWS console (Bedrock → API Keys) and add to
`.env`:

```bash
AWS_REGION=us-east-1
BEDROCK_API_KEY=ABSKQmVkcm9ja0FQSUtleS...

# Still needed for S3, Cognito, etc. (or use an EC2 instance role)
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
```

Benefits:

- Single token per environment, easy to rotate
- Works identically for the Claude Code CLI subprocess and direct Bedrock SDK calls
- No IAM `bedrock:InvokeModel` policy needed — the key carries its own scope

### Option 2: AWS Access Key / Secret Key

Classic SigV4 credentials:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
```

Or use the AWS credentials file:

```ini
# ~/.aws/credentials
[default]
aws_access_key_id = your_access_key_here
aws_secret_access_key = your_secret_key_here
```

### Required AWS Permissions (AK/SK path only)

If you use AK/SK, the IAM user/role needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/amazon.nova-*",
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-*",
        "arn:aws:bedrock:*:*:inference-profile/*"
      ]
    }
  ]
}
```

When using a Bedrock API Key instead, these permissions are inherent to the
key and this IAM policy is not required.

### Bedrock Model Access

Ensure your AWS account has model access enabled:

1. Go to AWS Bedrock console
2. Navigate to **Model access**
3. Request access to Claude (Sonnet, Haiku, Opus) and Amazon Nova models

### Notes on Nova Canvas (avatar generation)

`avatarService` calls Amazon Nova Canvas, which is only available in
`us-east-1`. The code pins that region regardless of `AWS_REGION`.
If you use a Bedrock API Key, make sure the key's account has Nova Canvas
access enabled in `us-east-1`.

### Troubleshooting

- **401 / 403 from Bedrock when `BEDROCK_API_KEY` is set** — confirm the key is
  not expired and the account has access to the requested model in the target
  region.
- **Claude Code CLI still falls back to direct Anthropic API** — verify
  `CLAUDE_CODE_USE_BEDROCK=1` is set and the subprocess inherits
  `AWS_BEARER_TOKEN_BEDROCK` (logged at process start).
- **Mixed auth errors** — the AWS SDK prefers SigV4 when both `AWS_ACCESS_KEY_ID`
  and `AWS_BEARER_TOKEN_BEDROCK` are present. The shared Bedrock client factory
  (`services/bedrock-client.ts`) strips explicit credentials when an API Key is
  configured.
- **Requests signed by EC2 instance role instead of API Key** — on EC2/ECS/AgentCore
  the SDK's default auth scheme order is `[sigv4, httpBearerAuth]`, and SigV4
  resolves via IMDS before bearer is ever tried. The shared factory sets
  `authSchemePreference: ['httpBearerAuth']` internally and propagates
  `AWS_AUTH_SCHEME_PREFERENCE=httpBearerAuth` into subprocess envs to force
  bearer-first. If you see `AccessDenied` in CloudTrail with `userIdentity.arn`
  pointing to the EC2 instance role, verify the backend was restarted after
  upgrading and that the AgentCore runtime env was refreshed (via
  `deploy-full.sh --bedrock-api-key ...` or `update-agent-runtime`).
