#!/bin/bash
set -euo pipefail

# Disable AWS CLI pager (compatible with both v1 and v2)
export AWS_PAGER=""

# =============================================================================
# Super Agent — Unified Deploy Script
#
# Works for both fresh and existing environments. Reads all config from
# CloudFormation stack outputs. Handles .env merge (never overwrites user vars).
#
# Usage:
#   # Core only (local auth, no CDN):
#   ./deploy.sh <SSH_KEY>
#
#   # With Cognito:
#   ./deploy.sh <SSH_KEY> --cognito-password 'MyPass1'
#
#   # With extra .env overrides:
#   ./deploy.sh <SSH_KEY> --env-file /path/to/extra.env
#
#   # Custom stack/region:
#   ./deploy.sh <SSH_KEY> --stack SuperAgentTest --region us-east-1
#
# =============================================================================

SSH_KEY="${1:?Usage: ./deploy.sh <SSH_KEY_PATH> [options]}"
shift

# Defaults
STACK_NAME="SuperAgent"
REGION="us-west-2"
COGNITO_PASSWORD=""
ENV_FILE=""
SKIP_FRONTEND=false
SKIP_BACKEND=false
FRONTEND_S3_BUCKET=""
CF_DISTRIBUTION_ID=""
BEDROCK_API_KEY="${BEDROCK_API_KEY:-}"

# Parse options
while [[ $# -gt 0 ]]; do
  case "$1" in
    --stack)            STACK_NAME="$2"; shift 2 ;;
    --region)           REGION="$2"; shift 2 ;;
    --cognito-password) COGNITO_PASSWORD="$2"; shift 2 ;;
    --env-file)         ENV_FILE="$2"; shift 2 ;;
    --skip-frontend)    SKIP_FRONTEND=true; shift ;;
    --skip-backend)     SKIP_BACKEND=true; shift ;;
    --s3-bucket)        FRONTEND_S3_BUCKET="$2"; shift 2 ;;
    --cf-dist-id)       CF_DISTRIBUTION_ID="$2"; shift 2 ;;
    --bedrock-api-key)  BEDROCK_API_KEY="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

SSH_USER="ubuntu"
LOCAL_SSH_PORT=2222
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# =========================================================================
# Read stack outputs
# =========================================================================
echo "=== Reading stack outputs from $STACK_NAME ($REGION) ==="
OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs" \
  --output json)

get_output() {
  echo "$OUTPUTS" | python3 -c "
import sys, json
outputs = json.load(sys.stdin)
for o in outputs:
    if o['OutputKey'] == '$1':
        print(o['OutputValue'])
        break
" 2>/dev/null || echo ""
}

INSTANCE_ID=$(get_output "InstanceId")
PUBLIC_IP=$(get_output "PublicIP")
DB_ENDPOINT=$(get_output "DBEndpoint")
DB_SECRET_ARN=$(get_output "DBSecretArn")
AVATAR_BUCKET=$(get_output "AvatarBucketName")
SKILLS_BUCKET=$(get_output "SkillsBucketName")
WORKSPACE_BUCKET=$(get_output "WorkspaceBucketName")
AUTH_MODE=$(get_output "AuthMode")
ENABLE_CDN=$(get_output "EnableCdn")

# Optional outputs
COGNITO_USER_POOL_ID=$(get_output "CognitoUserPoolId")
COGNITO_CLIENT_ID=$(get_output "CognitoClientId")
COGNITO_DOMAIN=$(get_output "CognitoDomainUrl")
FRONTEND_BUCKET=$(get_output "FrontendBucketName")
CF_DIST_ID=$(get_output "CloudFrontDistributionId")
DOMAIN_NAME=$(get_output "DomainName")
REDIS_ENDPOINT=$(get_output "RedisEndpoint")
REDIS_PORT_OUTPUT=$(get_output "RedisPort")

echo "  InstanceId:       $INSTANCE_ID"
echo "  PublicIP:         $PUBLIC_IP"
echo "  AuthMode:         $AUTH_MODE"
echo "  EnableCdn:        $ENABLE_CDN"
echo "  WorkspaceBucket:  $WORKSPACE_BUCKET"
echo "  SkillsBucket:     $SKILLS_BUCKET"
[ -n "$REDIS_ENDPOINT" ] && echo "  RedisEndpoint:    $REDIS_ENDPOINT:${REDIS_PORT_OUTPUT:-6379}"
[ -n "$DOMAIN_NAME" ] && echo "  DomainName:       $DOMAIN_NAME"
[ -n "$CF_DIST_ID" ]  && echo "  CloudFrontDistId: $CF_DIST_ID"

# =========================================================================
# Cognito setup (only if authMode=cognito)
# =========================================================================
if [ "$AUTH_MODE" = "cognito" ] && [ -n "$COGNITO_USER_POOL_ID" ]; then
  APP_URL="https://${DOMAIN_NAME:-$PUBLIC_IP}"

  echo ""
  echo "=== Updating Cognito callback URLs ==="
  aws cognito-idp update-user-pool-client \
    --user-pool-id "$COGNITO_USER_POOL_ID" \
    --client-id "$COGNITO_CLIENT_ID" \
    --callback-urls "$APP_URL/auth/callback" "http://localhost:5173/auth/callback" \
    --logout-urls "$APP_URL/login" "http://localhost:5173/login" \
    --allowed-o-auth-flows code \
    --allowed-o-auth-scopes openid email profile \
    --allowed-o-auth-flows-user-pool-client \
    --supported-identity-providers COGNITO \
    --region "$REGION"
  echo "  Done."

  if [ -n "$COGNITO_PASSWORD" ]; then
    echo "=== Setting Cognito admin password ==="
    ADMIN_EMAIL=$(aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" --region "$REGION" \
      --query "Stacks[0].Parameters[?ParameterKey=='AdminEmail'].ParameterValue" \
      --output text 2>/dev/null || echo "admin@example.com")
    aws cognito-idp admin-set-user-password \
      --user-pool-id "$COGNITO_USER_POOL_ID" \
      --username "$ADMIN_EMAIL" \
      --password "$COGNITO_PASSWORD" --permanent \
      --region "$REGION"
    echo "  Done. Login: $ADMIN_EMAIL"
  fi
fi

# =========================================================================
# SSM tunnel
# =========================================================================
echo ""
echo "=== Starting SSM tunnel (localhost:$LOCAL_SSH_PORT -> EC2:22) ==="

for i in $(seq 1 30); do
  STATUS=$(aws ssm describe-instance-information \
    --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
    --region "$REGION" \
    --query "InstanceInformationList[0].PingStatus" \
    --output text 2>/dev/null || echo "None")
  [ "$STATUS" = "Online" ] && echo "  SSM agent online." && break
  echo "  Attempt $i/30 - status: $STATUS, waiting 10s..."
  sleep 10
done

lsof -ti:$LOCAL_SSH_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true

aws ssm start-session \
  --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSession \
  --parameters "portNumber=22,localPortNumber=$LOCAL_SSH_PORT" \
  --region "$REGION" &
SSM_PID=$!

cleanup() { kill $SSM_PID 2>/dev/null || true; wait $SSM_PID 2>/dev/null || true; }
trap cleanup EXIT

sleep 5
SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p $LOCAL_SSH_PORT $SSH_USER@localhost"
RSYNC_SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p $LOCAL_SSH_PORT"

for i in $(seq 1 10); do
  $SSH_CMD "echo ok" 2>/dev/null && echo "  Tunnel ready." && break
  [ "$i" -eq 10 ] && echo "ERROR: tunnel failed" && exit 1
  sleep 3
done

# =========================================================================
# .env merge — generate base, preserve user-added vars, apply overrides
# =========================================================================
echo ""
echo "=== Generating and merging .env ==="

# Determine CORS and APP_URL
if [ -n "$DOMAIN_NAME" ]; then
  APP_URL="https://$DOMAIN_NAME"
  CORS_VALUE="https://$DOMAIN_NAME"
else
  APP_URL="https://$PUBLIC_IP"
  CORS_VALUE="https://$PUBLIC_IP"
fi

# Build base .env content
BASE_ENV=$(cat << BASEEOF
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
REDIS_HOST=${REDIS_ENDPOINT:-localhost}
REDIS_PORT=${REDIS_PORT_OUTPUT:-6379}
REDIS_PASSWORD=${REDIS_ENDPOINT:+}
AUTH_MODE=$AUTH_MODE
AWS_REGION=$REGION
S3_BUCKET_NAME=$AVATAR_BUCKET
S3_PRESIGNED_URL_EXPIRES=3600
SKILLS_S3_BUCKET=$SKILLS_BUCKET
CORS_ORIGIN=$CORS_VALUE
APP_URL=$APP_URL
CLAUDE_CODE_USE_BEDROCK=1
CLAUDE_MODEL=claude-sonnet-4-6
AGENT_WORKSPACE_BASE_DIR=/opt/super-agent/workspaces
AGENT_RUNTIME=claude
AGENTCORE_WORKSPACE_S3_BUCKET=$WORKSPACE_BUCKET
BASEEOF
)

# Inject Bedrock API Key if provided (takes priority over AK/SK).
if [ -n "${BEDROCK_API_KEY:-}" ]; then
  BASE_ENV="$BASE_ENV
BEDROCK_API_KEY=$BEDROCK_API_KEY"
fi

# Add Cognito vars if applicable
if [ "$AUTH_MODE" = "cognito" ] && [ -n "$COGNITO_USER_POOL_ID" ]; then
  BASE_ENV="$BASE_ENV
COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
COGNITO_REGION=$REGION
COGNITO_DOMAIN=$COGNITO_DOMAIN"
else
  BASE_ENV="$BASE_ENV
JWT_SECRET=$(openssl rand -hex 32)"
fi

# Fetch DATABASE_URL on EC2 and merge (production-first: existing values win)
$SSH_CMD << REMOTE_ENV
set -euo pipefail

# Fetch DATABASE_URL
DATABASE_URL=\$(/opt/super-agent/fetch-db-url.sh "$DB_SECRET_ARN")

# Write base env (defaults for missing keys) to temp file
cat > /tmp/base-env << 'BASE_MARKER'
$BASE_ENV
BASE_MARKER
echo "DATABASE_URL=\${DATABASE_URL}" >> /tmp/base-env

# Merge: production .env wins — base only fills in missing keys
if [ -f /opt/super-agent/.env ]; then
  cp /opt/super-agent/.env /opt/super-agent/.env.bak.\$(date +%s)
  # Start from existing production .env (strip comments/blanks for key lookup)
  cp /opt/super-agent/.env /tmp/new-env

  # Replace placeholder values (left by UserData bootstrap)
  sed -i '/=CHANGE_ME$/d' /tmp/new-env

  # Append any base keys that are missing from production
  while IFS= read -r line; do
    [[ "\$line" =~ ^#.*$ ]] && continue
    [[ -z "\$line" ]] && continue
    key=\$(echo "\$line" | cut -d= -f1)
    if ! grep -q "^\${key}=" /tmp/new-env; then
      echo "\$line" >> /tmp/new-env
    fi
  done < /tmp/base-env
else
  # Fresh deploy — no existing .env, use base as-is
  cp /tmp/base-env /tmp/new-env
fi

mv /tmp/new-env /opt/super-agent/.env
chmod 600 /opt/super-agent/.env
echo "  .env written (existing values preserved, missing keys added)."
rm -f /tmp/base-env
REMOTE_ENV

# Apply --env-file overrides (if provided)
if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
  echo "  Applying overrides from $ENV_FILE..."
  while IFS= read -r line; do
    [[ "$line" =~ ^#.*$ ]] && continue
    [[ -z "$line" ]] && continue
    key=$(echo "$line" | cut -d= -f1)
    val=$(echo "$line" | cut -d= -f2-)
    $SSH_CMD "sed -i 's|^${key}=.*|${key}=${val}|' /opt/super-agent/.env || echo '${key}=${val}' >> /opt/super-agent/.env"
  done < "$ENV_FILE"
fi

# =========================================================================
# Build + sync frontend
# =========================================================================
if [ "$SKIP_FRONTEND" = false ]; then
  echo ""
  echo "=== Building frontend ==="
  cd "$PROJECT_ROOT/frontend"

  # Generate .env.production for Vite
  if [ "$AUTH_MODE" = "cognito" ] && [ -n "$COGNITO_USER_POOL_ID" ]; then
    cat > .env.production << VITE_EOF
VITE_API_BASE_URL=
VITE_COGNITO_REGION=$REGION
VITE_COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID
VITE_COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
VITE_COGNITO_DOMAIN=$COGNITO_DOMAIN
VITE_COGNITO_REDIRECT_URI=$APP_URL/auth/callback
VITE_EOF
  else
    cat > .env.production << VITE_EOF
VITE_API_BASE_URL=
VITE_AUTH_MODE=local
VITE_EOF
  fi

  npm install
  npx vite build

  # Always sync to EC2 (Nginx 443 fallback)
  echo "=== Syncing frontend to EC2 ==="
  cd "$PROJECT_ROOT"
  $SSH_CMD "mkdir -p /opt/super-agent/frontend/dist"
  rsync -avz --delete \
    -e "$RSYNC_SSH" \
    frontend/dist/ \
    "$SSH_USER@localhost:/opt/super-agent/frontend/dist/"

  # If CDN enabled (via stack output or CLI override), also sync to S3 + invalidate CloudFront
  EFFECTIVE_BUCKET="${FRONTEND_S3_BUCKET:-$FRONTEND_BUCKET}"
  EFFECTIVE_CF_ID="${CF_DISTRIBUTION_ID:-$CF_DIST_ID}"

  if [ -n "$EFFECTIVE_BUCKET" ]; then
    echo "=== Syncing frontend to S3 ($EFFECTIVE_BUCKET) ==="
    aws s3 sync frontend/dist/ "s3://$EFFECTIVE_BUCKET/" --delete --region "$REGION"
    if [ -n "$EFFECTIVE_CF_ID" ]; then
      echo "=== Invalidating CloudFront ($EFFECTIVE_CF_ID) ==="
      aws cloudfront create-invalidation --distribution-id "$EFFECTIVE_CF_ID" --paths "/*" --region "$REGION" 2>/dev/null || true
    fi
  elif [ "$ENABLE_CDN" = "true" ] && [ -n "$FRONTEND_BUCKET" ]; then
    echo "=== Syncing frontend to S3 + CloudFront invalidation ==="
    aws s3 sync frontend/dist/ "s3://$FRONTEND_BUCKET/" --delete --region "$REGION"
    if [ -n "$CF_DIST_ID" ]; then
      aws cloudfront create-invalidation --distribution-id "$CF_DIST_ID" --paths "/*" --region "$REGION" 2>/dev/null || true
    fi
  fi
fi

# =========================================================================
# Sync + build backend
# =========================================================================
if [ "$SKIP_BACKEND" = false ]; then
  echo ""
  echo "=== Building backend locally ==="
  cd "$PROJECT_ROOT/backend"
  npm install
  npx tsc --noUnusedLocals false --noUnusedParameters false --strict false --noImplicitAny false --strictNullChecks false 2>&1 || true
  [ ! -f dist/index.js ] && echo "ERROR: local tsc failed, dist/index.js not found" && exit 1

  echo "=== Syncing backend to EC2 ==="
  cd "$PROJECT_ROOT"
  rsync -avz --delete \
    -e "$RSYNC_SSH" \
    --exclude='node_modules' \
    --exclude='.env' \
    --exclude='data/' \
    backend/ \
    "$SSH_USER@localhost:/opt/super-agent/backend/"

  echo "=== Installing deps, migrating, restarting ==="
  $SSH_CMD << 'REMOTE_DEPLOY'
set -euo pipefail
cd /opt/super-agent/backend
ln -sf /opt/super-agent/.env .env

echo "  npm install..."
npm install

echo "  prisma generate..."
npx prisma generate

echo "  DB grants..."
source /opt/super-agent/.env
PSQL_URL=$(echo "$DATABASE_URL" | sed 's/?schema=public//' | sed 's/sslmode=no-verify/sslmode=require/')
psql "$PSQL_URL" << 'GRANTS_SQL'
GRANT ALL PRIVILEGES ON DATABASE super_agent TO superagent;
GRANT ALL ON SCHEMA public TO superagent;
ALTER SCHEMA public OWNER TO superagent;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO superagent;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO superagent;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO superagent;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO superagent;
GRANTS_SQL

echo "  prisma migrate deploy..."
npx prisma migrate deploy

echo "  Seeding (skip if data exists)..."
AGENT_COUNT=$(psql "$PSQL_URL" -t -A -c "SELECT count(*) FROM agents;" 2>/dev/null || echo "0")
if [ "$AGENT_COUNT" -gt "0" ] 2>/dev/null; then
  echo "  (Seed skipped: $AGENT_COUNT agents already exist)"
else
  npx tsx prisma/seed.ts 2>/dev/null || echo "  (Seed failed or already seeded)"

  # Set default password for seed admin user (local auth mode)
  echo "  Setting admin default password..."
  ADMIN_HASH=$(node -e 'require("bcryptjs").hash("Admin1234!", 10).then(h => process.stdout.write(h))')
  psql "$PSQL_URL" -c "UPDATE profiles SET password_hash = '${ADMIN_HASH}' WHERE username = 'admin@example.com' AND password_hash IS NULL;" 2>/dev/null || true
  echo "  Admin login: admin@example.com / Admin1234!"
fi

echo "  Restarting backend..."
sudo systemctl restart backend
sudo systemctl enable backend
sleep 3
sudo systemctl status backend --no-pager || true
REMOTE_DEPLOY
fi

# =========================================================================
# Done
# =========================================================================
echo ""
echo "============================================="
echo "  Deployment complete!"
echo "============================================="
echo "  App URL:  $APP_URL"
echo "  Health:   $APP_URL/api/health"
echo "  SSM:      aws ssm start-session --target $INSTANCE_ID --region $REGION"
[ "$AUTH_MODE" = "cognito" ] && echo "  Cognito:  https://$COGNITO_DOMAIN"
[ "$ENABLE_CDN" = "true" ] && echo "  CDN:      CloudFront $CF_DIST_ID"
echo "============================================="
