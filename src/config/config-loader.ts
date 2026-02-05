import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface Config {
  redis: {
    url: string;
  };
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  exotel: {
    apiKey: string;
    token: string;
  };
  jwt: {
    secret: string;
  };
}

let _config: Config | null = null;

/**
 * Load configuration from file or environment variables
 * Priority: config file > environment variables
 */
export function loadConfig(): Config {
  if (_config) {
    return _config;
  }

  // Try to load from mounted config file first
  const configPath = process.env.CONFIG_FILE_PATH || '/app/config/config.production.json';

  console.error(`[CONFIG-LOADER] Attempting to load config from: ${configPath}`);

  if (existsSync(configPath)) {
    try {
      const configContent = readFileSync(configPath, 'utf-8');
      _config = JSON.parse(configContent);
      console.error('[CONFIG-LOADER] ✅ Successfully loaded config from file');
      console.error(`[CONFIG-LOADER] Redis URL length: ${_config?.redis?.url?.length || 0}`);
      console.error(`[CONFIG-LOADER] Supabase URL: ${_config?.supabase?.url?.substring(0, 30)}...`);
      return _config!;
    } catch (error: any) {
      console.error('[CONFIG-LOADER] ⚠️ Failed to load config file:', error.message);
    }
  } else {
    console.error(`[CONFIG-LOADER] ⚠️ Config file not found at: ${configPath}`);
  }

  // Fallback to environment variables
  console.error('[CONFIG-LOADER] 📋 Falling back to environment variables');

  // TEMPORARY HARDCODE - Same fallback as redis.config.ts
  // This is a workaround for Azure Container Apps env var injection issues

  _config = {
    redis: {
      url: process.env.REDIS_URL || `rediss://:${process.env.REDIS_PASSWORD || process.env.AZURE_REDIS_PASSWORD}@banxway-redis.redis.cache.windows.net:6380`,
    },
    supabase: {
      url: process.env.SUPABASE_URL || '',
      anonKey: process.env.SUPABASE_ANON_KEY || '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
    exotel: {
      apiKey: process.env.EXOTEL_API_KEY || '',
      token: process.env.EXOTEL_TOKEN || '',
    },
    jwt: {
      secret: process.env.JWT_SECRET || '',
    },
  };

  console.error(`[CONFIG-LOADER] Redis URL from env: ${_config.redis.url.substring(0, 30)}...`);

  return _config;
}

/**
 * Get specific config value
 */
export function getConfigValue(path: string): string {
  const config = loadConfig();
  const parts = path.split('.');
  let value: any = config;

  for (const part of parts) {
    value = value[part];
    if (value === undefined) {
      throw new Error(`Config path not found: ${path}`);
    }
  }

  return value;
}
