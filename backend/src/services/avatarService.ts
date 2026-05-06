import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createBedrockClient, hasBedrockApiKey } from "./bedrock-client.js";

export interface AvatarGenerationResult {
  role: string;
  avatarKey: string | null;
  error?: string;
}

interface CacheEntry {
  data: Buffer;
  timestamp: number;
}

export class AvatarService {
  private bedrockClient!: BedrockRuntimeClient;
  private s3Client!: S3Client;
  private bucketName!: string;
  private initialized = false;
  
  // In-memory cache for avatar images
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_CACHE_SIZE = 100; // Max number of cached images

  /** Lazy init — ensures process.env is populated (dotenv / systemd EnvironmentFile). */
  private ensureInit(): void {
    if (this.initialized) return;
    const region = process.env.AWS_REGION || "us-west-2";
    this.bucketName = process.env.S3_AVATARS_BUCKET || process.env.S3_BUCKET_NAME || "super-agent-avatars";

    console.log('AvatarService initialized:', {
      region,
      bucketName: this.bucketName,
      bedrockAuth: hasBedrockApiKey() ? 'api-key' : 'sigv4',
      hasAwsCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    });

    // Nova Canvas is only available in us-east-1. Use shared factory so the
    // Bedrock API Key (if configured) takes priority over AK/SK.
    this.bedrockClient = createBedrockClient({ region: "us-east-1" });
    this.s3Client = new S3Client({ region });
    this.initialized = true;
  }

  async generateAvatar(prompt: string): Promise<string> {
    this.ensureInit();
    console.log('Starting avatar generation with prompt:', prompt);
    
    try {
      // Generate image with Nova Canvas
      const payload = {
        taskType: "TEXT_IMAGE",
        textToImageParams: { text: prompt },
        imageGenerationConfig: {
          seed: Math.floor(Math.random() * 858993460),
          quality: "standard",
          width: 512,
          height: 512,
          numberOfImages: 1
        }
      };

      console.log('Calling Nova Canvas with payload:', JSON.stringify(payload, null, 2));
      
      const response = await this.bedrockClient.send(new InvokeModelCommand({
        modelId: "amazon.nova-canvas-v1:0",
        body: JSON.stringify(payload)
      }));

      console.log('Nova Canvas response received, parsing...');
      
      const result = JSON.parse(new TextDecoder().decode(response.body));
      
      if (!result.images || !result.images[0]) {
        throw new Error('No image returned from Nova Canvas');
      }
      
      const base64Image = result.images[0];
      console.log('Base64 image length:', base64Image.length);
      
      // Convert base64 to buffer
      const imageBuffer = Buffer.from(base64Image, 'base64');
      console.log('Image buffer size:', imageBuffer.length, 'bytes');
      
      // Generate unique filename
      const filename = `avatars/${Date.now()}-${Math.random().toString(36).substring(2)}.png`;
      console.log('Uploading to S3 with filename:', filename);
      
      // Upload to S3
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: filename,
        Body: imageBuffer,
        ContentType: 'image/png'
      }));

      console.log('Successfully uploaded to S3:', filename);
      
      // Return the S3 key (not URL) - frontend will request via backend
      return filename;
    } catch (err) {
      const error = err as Error & { code?: string; $metadata?: { httpStatusCode?: number; requestId?: string } };
      console.error('Avatar generation error details:', {
        message: error.message,
        code: error.code,
        statusCode: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Generate multiple avatars in parallel
   * @param roles - Array of role names to generate avatars for
   * @returns Array of results with role, avatarKey, and optional error
   */
  async generateAvatarsBatch(roles: string[]): Promise<AvatarGenerationResult[]> {
    this.ensureInit();
    console.log(`Starting batch avatar generation for ${roles.length} roles`);
    
    const promises = roles.map(async (role): Promise<AvatarGenerationResult> => {
      try {
        const prompt = this.generateAvatarPrompt(role);
        const avatarKey = await this.generateAvatar(prompt);
        return { role, avatarKey };
      } catch (err) {
        const error = err as Error;
        console.error(`Failed to generate avatar for role "${role}":`, error.message);
        return { role, avatarKey: null, error: error.message };
      }
    });

    // Execute all in parallel
    const results = await Promise.all(promises);
    
    const successCount = results.filter(r => r.avatarKey !== null).length;
    console.log(`Batch avatar generation complete: ${successCount}/${roles.length} successful`);
    
    return results;
  }

  async getAvatarUrl(s3Key: string): Promise<string> {
    this.ensureInit();
    console.log('Getting avatar URL:', { bucket: this.bucketName, key: s3Key });
    
    // First check if the object exists
    try {
      await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key
      }));
      console.log('Object exists in S3:', s3Key);
    } catch (err) {
      const error = err as Error & { name?: string };
      if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
        console.error('Object not found in S3:', { bucket: this.bucketName, key: s3Key });
        throw new Error(`Avatar not found: ${s3Key}`);
      }
      throw err;
    }
    
    // Generate presigned URL valid for 1 hour
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key
    });
    
    const presignedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    console.log('Generated presigned URL:', presignedUrl.substring(0, 100) + '...');
    
    return presignedUrl;
  }

  async getAvatarData(s3Key: string): Promise<Buffer> {
    this.ensureInit();
    // Check cache first
    const cached = this.cache.get(s3Key);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
      console.log('Avatar cache hit:', s3Key);
      return cached.data;
    }
    
    console.log('Avatar cache miss, fetching from S3:', { bucket: this.bucketName, key: s3Key });
    
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key
    });
    
    const response = await this.s3Client.send(command);
    
    if (!response.Body) {
      throw new Error(`No body in S3 response for: ${s3Key}`);
    }
    
    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    
    const data = Buffer.concat(chunks);
    
    // Store in cache (with LRU eviction if needed)
    this.addToCache(s3Key, data);
    
    console.log('Avatar data retrieved and cached:', s3Key);
    return data;
  }

  private addToCache(key: string, data: Buffer): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      
      for (const [k, v] of this.cache.entries()) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      
      if (oldestKey) {
        this.cache.delete(oldestKey);
        console.log('Cache evicted:', oldestKey);
      }
    }
    
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  generateAvatarPrompt(role: string, _description?: string): string {
    // Extract just the concept/profession, avoiding non-English text that might be rendered
    // For Chinese roles, use a generic professional description
    const isChinese = /[\u4e00-\u9fa5]/.test(role);
    const roleDescription = isChinese 
      ? 'a professional business person' 
      : `a person who works as ${role}`;
    
    return `Photorealistic professional headshot portrait photograph of ${roleDescription}, corporate business photo, plain solid color background, natural studio lighting, sharp focus, high resolution, looking directly at camera, friendly professional expression, shoulders visible, clean simple composition, absolutely no text, no letters, no words, no characters, no writing, no watermarks, no logos, no symbols, no overlays`;
  }
}

export const avatarService = new AvatarService();
