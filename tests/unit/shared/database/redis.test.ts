import { EventEmitter } from 'events';

const mockRedisConnect = jest.fn().mockResolvedValue(undefined);
const mockRedisQuit = jest.fn().mockResolvedValue(undefined);
let capturedRetryStrategy: (times: number) => number;
let mockStatus: string;
let mockRedisInstance: EventEmitter;

jest.mock('ioredis', () => {
  const { EventEmitter: MockEventEmitter } = jest.requireActual('events');

  return jest.fn().mockImplementation((config: { retryStrategy: (times: number) => number }) => {
    capturedRetryStrategy = config.retryStrategy;

    const instance = new MockEventEmitter();
    instance.connect = mockRedisConnect;
    instance.quit = mockRedisQuit;
    Object.defineProperty(instance, 'status', {
      get: () => mockStatus,
    });

    mockRedisInstance = instance;
    return instance;
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
    it('should not call connect again when already ready', async () => {
      mockStatus = 'ready';

      await connectRedis();

      expect(mockRedisConnect).not.toHaveBeenCalled();
    });

    it.each(['wait', 'end', 'close'])(
      'should connect to Redis when status is %s',
      async (status) => {
        mockStatus = status;

        await connectRedis();

        expect(mockRedisConnect).toHaveBeenCalled();
      }
    );

    it.each(['connecting', 'connect', 'reconnecting'])(
      'should wait for the ready event without reconnecting when status is %s',
      async (status) => {
        mockStatus = status;

        const pending = connectRedis();
        expect(mockRedisConnect).not.toHaveBeenCalled();

        mockRedisInstance.emit('ready');
        await pending;

        expect(mockRedisConnect).not.toHaveBeenCalled();
        expect(mockRedisInstance.listenerCount('ready')).toBe(0);
        expect(mockRedisInstance.listenerCount('error')).toBe(0);
      }
    );

    it('should reject and clean up listeners when the in-progress connection errors', async () => {
      mockStatus = 'connecting';
      const failure = new Error('connection refused');

      const pending = connectRedis();
      mockRedisInstance.emit('error', failure);

      await expect(pending).rejects.toThrow(failure);
      expect(mockRedisConnect).not.toHaveBeenCalled();
      expect(mockRedisInstance.listenerCount('ready')).toBe(0);
      expect(mockRedisInstance.listenerCount('error')).toBe(0);
    });
  });

  describe('disconnectRedis', () => {
    it('should disconnect from Redis', async () => {
      await disconnectRedis();

      expect(mockRedisQuit).toHaveBeenCalled();
    });
  });
});
