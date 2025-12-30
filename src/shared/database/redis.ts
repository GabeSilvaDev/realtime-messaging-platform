import Redis from 'ioredis';
import config from '../config/database';

const redisConfig = config.redis;

const redis = new Redis({
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
  retryStrategy: (times: number): number => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

async function connectRedis(): Promise<void> {
  await redis.connect();
}

async function disconnectRedis(): Promise<void> {
  await redis.quit();
}

export { redis, connectRedis, disconnectRedis };
export default redis;
