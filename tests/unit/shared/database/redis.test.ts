const mockRedisConnect = jest.fn().mockResolvedValue(undefined);
const mockRedisQuit = jest.fn().mockResolvedValue(undefined);
let capturedRetryStrategy: (times: number) => number;

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation((config) => {
    capturedRetryStrategy = config.retryStrategy;
    return {
      connect: mockRedisConnect,
      quit: mockRedisQuit,
    };
  });
});

jest.mock('@/shared/config/database', () => ({
  default: {
    redis: {
      host: 'localhost',
      port: 6379,
      password: 'password',
    },
  },
  __esModule: true,
}));

import { redis, connectRedis, disconnectRedis } from '@/shared/database/redis';

describe('Redis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('redis client', () => {
    it('should export redis instance', () => {
      expect(redis).toBeDefined();
    });

    it('should have retryStrategy that calculates delay based on times', () => {
      expect(capturedRetryStrategy(1)).toBe(50);
      expect(capturedRetryStrategy(10)).toBe(500);
      expect(capturedRetryStrategy(100)).toBe(2000);
    });
  });

  describe('connectRedis', () => {
    it('should connect to Redis', async () => {
      await connectRedis();

      expect(mockRedisConnect).toHaveBeenCalled();
    });
  });

  describe('disconnectRedis', () => {
    it('should disconnect from Redis', async () => {
      await disconnectRedis();

      expect(mockRedisQuit).toHaveBeenCalled();
    });
  });
});
