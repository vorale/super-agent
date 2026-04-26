/**
 * Workspace Sync — mirrors /workspace ↔ S3.
 *
 * The backend uploads the full workspace (skills, agents, CLAUDE.md, etc.)
 * to S3 before invoking AgentCore. This module:
 *   - restoreWorkspaceFromS3: downloads S3 → /workspace/
 *   - syncWorkspaceToS3: uploads /workspace/ → S3
 *
 * S3 layout mirrors the local workspace exactly:
 *   s3://{bucket}/{prefix}.claude/skills/...
 *   s3://{bucket}/{prefix}.claude/agents/...
 *   s3://{bucket}/{prefix}.claude/CLAUDE.md
 *   s3://{bucket}/{prefix}.claude/settings.json
 *   s3://{bucket}/{prefix}README.md  (agent-generated files)
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';

const WORKSPACE_DIR = '/workspace';
/**
 * Directories to skip during S3 sync.
 * These are large, auto-generated directories that can be recreated locally
 * and would massively slow down sync (node_modules alone can be 100k+ files).
 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  '.env',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.parcel-cache',
  'bower_components',
  '.gradle',
  'target',          // Maven/Rust
  '.cargo',
]);
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Restore: S3 → /workspace/
// ---------------------------------------------------------------------------

export async function restoreWorkspaceFromS3(
  s3: S3Client,
  bucket: string,
  prefix: string,
): Promise<number> {
  // List all objects under the prefix
  const allKeys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const obj of result.Contents ?? []) {
      if (obj.Key) allKeys.push(obj.Key);
    }
    continuationToken = result.NextContinuationToken;
  } while (continuationToken);

  if (allKeys.length === 0) {
    console.log(`[workspace-sync] No files found at s3://${bucket}/${prefix}`);
    return 0;
  }

  console.log(`[workspace-sync] Restoring ${allKeys.length} files from S3...`);

  let restored = 0;
  for (const key of allKeys) {
    const relativePath = key.slice(prefix.length);
    if (!relativePath) continue;

    const localPath = path.join(WORKSPACE_DIR, relativePath);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });

    try {
      const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (response.Body) {
        await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(localPath));
        restored++;
      }
    } catch (err) {
      console.warn(`[workspace-sync] Failed to restore ${relativePath}: ${err}`);
    }
  }

  console.log(`[workspace-sync] Restored ${restored}/${allKeys.length} files`);
  return restored;
}

// ---------------------------------------------------------------------------
// Sync: /workspace/ → S3
// ---------------------------------------------------------------------------

export async function syncWorkspaceToS3(
  s3: S3Client,
  bucket: string,
  prefix: string,
): Promise<number> {
  let uploaded = 0;

  for (const filePath of walkDir(WORKSPACE_DIR)) {
    const relativePath = path.relative(WORKSPACE_DIR, filePath);
    const key = `${prefix}${relativePath}`;

    try {
      const fileStat = fs.statSync(filePath);
      if (fileStat.size > MAX_FILE_SIZE) continue;

      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: fileStat.size,
      }));
      uploaded++;
    } catch (err) {
      console.warn(`[workspace-sync] Upload failed for ${key}: ${err}`);
    }
  }

  if (uploaded > 0) {
    console.log(`[workspace-sync] Synced ${uploaded} files to s3://${bucket}/${prefix}`);
  }
  return uploaded;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walkDir(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}
