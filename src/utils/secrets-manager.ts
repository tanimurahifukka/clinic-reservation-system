import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from './logger';

const client = new SecretsManagerClient({ 
  region: process.env.AWS_REGION || 'ap-northeast-1' 
});

// Cache for secrets to avoid repeated API calls
const secretCache = new Map<string, { value: string; expiry: number }>();
const CACHE_TTL = 300000; // 5 minutes

export async function getSecretValue(secretName: string): Promise<string> {
  // Check cache first
  const cached = secretCache.get(secretName);
  if (cached && cached.expiry > Date.now()) {
    return cached.value;
  }

  try {
    const command = new GetSecretValueCommand({
      SecretId: `${process.env.STAGE || 'dev'}/clinic-reservation/${secretName}`,
    });

    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new Error(`Secret ${secretName} not found or is binary`);
    }

    // Parse JSON secrets
    let secretValue: string;
    try {
      const parsed = JSON.parse(response.SecretString);
      // If it's an object with a value property, use that
      secretValue = parsed.value || response.SecretString;
    } catch {
      // If not JSON, use as-is
      secretValue = response.SecretString;
    }

    // Cache the secret
    secretCache.set(secretName, {
      value: secretValue,
      expiry: Date.now() + CACHE_TTL,
    });

    return secretValue;
  } catch (error) {
    logger.error('Failed to retrieve secret', { secretName, error });
    
    // In development, fall back to environment variables
    if (process.env.STAGE === 'dev' || process.env.NODE_ENV === 'development') {
      const envKey = secretName.toUpperCase().replace(/-/g, '_');
      const envValue = process.env[envKey];
      if (envValue) {
        logger.info('Using environment variable fallback', { secretName, envKey });
        return envValue;
      }
    }
    
    throw error;
  }
}

export async function getSecretObject<T = any>(secretName: string): Promise<T> {
  const secretString = await getSecretValue(secretName);
  
  try {
    return JSON.parse(secretString);
  } catch (error) {
    logger.error('Failed to parse secret as JSON', { secretName, error });
    throw new Error(`Secret ${secretName} is not valid JSON`);
  }
}