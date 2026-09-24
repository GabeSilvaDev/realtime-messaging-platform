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
  // The rate limiter's RedisStore issues a command (SCRIPT LOAD) as soon as it is
  // constructed, which happens while `app.ts` is imported — before bootstrap() runs.
  // With `lazyConnect: true`, that first command auto-connects the client, so by the
  // time we get here `redis.status` may already be 'connecting'/'ready'. Calling
  // `redis.connect()` again in that case throws "Redis is already connecting/connected".
  if (redis.status === 'ready') {
    return;
  }
  if (redis.status === 'wait' || redis.status === 'end' || redis.status === 'close') {
    await redis.connect();
    return;
  }
  // Already connecting/reconnecting elsewhere (e.g. triggered by the rate limiter):
  // wait for it to finish instead of calling connect() again, and always remove the
  // listener for the event that didn't fire so we don't leak it.
  await new Promise<void>((resolve, reject) => {
    const onReady = (): void => {
      redis.off('error', onError);
      resolve();
    };
    const onError = (err: Error): void => {
      redis.off('ready', onReady);
      reject(err);
    };
    redis.once('ready', onReady);
    redis.once('error', onError);
  });
}

async function disconnectRedis(): Promise<void> {
  await redis.quit();
}

export { redis, connectRedis, disconnectRedis };
export default redis;
