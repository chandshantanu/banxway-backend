import { getRedisConnection } from '../src/config/redis.config';
import { logger } from '../src/utils/logger';

async function cleanup() {
  try {
    const redis = getRedisConnection();
    await redis.connect();
    logger.info('Connected to Redis');
    
    // Get memory info
    const info = await redis.info('memory');
    logger.info('Memory Info', { info });
    
    // Get all keys
    const keys = await redis.keys('*');
    logger.info(`Total Keys: ${keys.length}`);
    
    // Count keys by pattern
    const patterns: Record<string, number> = {
      'bull:email-processing:completed': 0,
      'bull:email-processing:failed': 0,
      'bull:email-processing:': 0,
      'bull:email-polling:': 0,
      'other': 0
    };
    
    keys.forEach((key: string) => {
      let found = false;
      for (const pattern in patterns) {
        if (key.startsWith(pattern) && pattern !== 'other') {
          patterns[pattern]++;
          found = true;
          break;
        }
      }
      if (!found) patterns['other']++;
    });
    
    logger.info('Keys by Pattern', patterns);
    
    // Clean up old completed/failed jobs
    logger.info('Cleaning up BullMQ jobs...');
    
    const completedKeys = keys.filter(k => k.includes(':completed'));
    const failedKeys = keys.filter(k => k.includes(':failed'));
    
    logger.info(`Completed job keys: ${completedKeys.length}`);
    logger.info(`Failed job keys: ${failedKeys.length}`);
    
    if (completedKeys.length > 0) {
      await redis.del(...completedKeys);
      logger.info(`✓ Deleted ${completedKeys.length} completed job keys`);
    }
    
    if (failedKeys.length > 0) {
      await redis.del(...failedKeys);
      logger.info(`✓ Deleted ${failedKeys.length} failed job keys`);
    }
    
    // Get memory info after cleanup
    const infoAfter = await redis.info('memory');
    logger.info('Memory Info After Cleanup', { info: infoAfter });
    
    await redis.quit();
    logger.info('Cleanup complete!');
    process.exit(0);
  } catch (error: any) {
    logger.error('Error during cleanup', { error: error.message });
    process.exit(1);
  }
}

cleanup();
