const mockRedisConnect = jest.fn().mockResolvedValue(undefined);
const mockRedisQuit = jest.fn().mockResolvedValue(undefined);
const mockRedisOnce = jest.fn();
let capturedRetryStrategy: (times: number) => number;
let mockStatus: string;

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation((config) => {
    capturedRetryStrategy = config.retryStrategy;
    return {
      connect: mockRedisConnect,
      quit: mockRedisQuit,
      once: mockRedisOnce,
      get status(): string {
        return mockStatus;
      },
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
    mockStatus = 'wait';
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
    it('should connect to Redis when idle', async () => {
      mockStatus = 'wait';

      await connectRedis();

      expect(mockRedisConnect).toHaveBeenCalled();
    });

    it('should not call connect again when already ready', async () => {
      mockStatus = 'ready';

      await connectRedis();

      expect(mockRedisConnect).not.toHaveBeenCalled();
    });

    it('should wait for the ready event when a connection is already in progress', async () => {
      mockStatus = 'connecting';
      mockRedisOnce.mockImplementation((event: string, listener: () => void) => {
        if (event === 'ready') {
          listener();
        }
      });

      await connectRedis();

      expect(mockRedisConnect).not.toHaveBeenCalled();
      expect(mockRedisOnce).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedisOnce).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('disconnectRedis', () => {
    it('should disconnect from Redis', async () => {
      await disconnectRedis();

      expect(mockRedisQuit).toHaveBeenCalled();
    });
  });
});
