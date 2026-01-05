const mockAuthenticate = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);

jest.mock('sequelize', () => {
  const actualSequelize = jest.requireActual('sequelize');
  return {
    ...actualSequelize,
    Sequelize: jest.fn().mockImplementation(() => ({
      authenticate: mockAuthenticate,
      close: mockClose,
    })),
  };
});

jest.mock('@/shared/config/database', () => ({
  default: {
    env: 'test',
    database: {
      test: {
        database: 'testdb',
        username: 'testuser',
        password: 'testpass',
        host: 'localhost',
        port: 5432,
        dialect: 'postgres',
        logging: false,
        define: {
          timestamps: true,
          underscored: true,
        },
        pool: {
          max: 5,
          min: 0,
        },
      },
    },
  },
  __esModule: true,
}));

import { sequelize, connectPostgres, disconnectPostgres } from '@/shared/database/sequelize';

describe('Sequelize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sequelize instance', () => {
    it('should export sequelize instance', () => {
      expect(sequelize).toBeDefined();
    });
  });

  describe('connectPostgres', () => {
    it('should authenticate the connection', async () => {
      await connectPostgres();

      expect(mockAuthenticate).toHaveBeenCalled();
    });
  });

  describe('disconnectPostgres', () => {
    it('should close the connection', async () => {
      await disconnectPostgres();

      expect(mockClose).toHaveBeenCalled();
    });
  });
});
