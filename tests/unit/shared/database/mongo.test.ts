const mockConnect = jest.fn().mockResolvedValue({});
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('mongoose', () => ({
  connect: mockConnect,
  disconnect: mockDisconnect,
  set: jest.fn(),
  default: {
    connect: mockConnect,
    disconnect: mockDisconnect,
    set: jest.fn(),
  },
}));

jest.mock('@/shared/config/database', () => ({
  default: {
    mongo: {
      uri: 'mongodb://localhost:27017/test',
      options: {
        maxPoolSize: 10,
      },
    },
  },
  __esModule: true,
}));

import { mongoose, connectMongo, disconnectMongo } from '@/shared/database/mongo';

describe('MongoDB', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('mongoose', () => {
    it('should export mongoose instance', () => {
      expect(mongoose).toBeDefined();
    });
  });

  describe('connectMongo', () => {
    it('should connect to MongoDB with config', async () => {
      await connectMongo();

      expect(mockConnect).toHaveBeenCalledWith('mongodb://localhost:27017/test', {
        maxPoolSize: 10,
      });
    });
  });

  describe('disconnectMongo', () => {
    it('should disconnect from MongoDB', async () => {
      await disconnectMongo();

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });
});
