describe('Database Index Exports', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should export all database modules', () => {
    jest.doMock('@/shared/database/sequelize', () => ({
      sequelize: { name: 'sequelize' },
      connectPostgres: jest.fn(),
      disconnectPostgres: jest.fn(),
    }));

    jest.doMock('@/shared/database/redis', () => ({
      redis: { name: 'redis' },
      connectRedis: jest.fn(),
      disconnectRedis: jest.fn(),
    }));

    jest.doMock('@/shared/database/mongo', () => ({
      mongoose: { name: 'mongoose' },
      connectMongo: jest.fn(),
      disconnectMongo: jest.fn(),
    }));

    jest.doMock('@/shared/database/elasticsearch', () => ({
      elasticsearch: { name: 'elasticsearch' },
      connectElasticsearch: jest.fn(),
      disconnectElasticsearch: jest.fn(),
    }));

    const databaseIndex = require('@/shared/database');

    expect(databaseIndex.sequelize).toBeDefined();
    expect(databaseIndex.connectPostgres).toBeDefined();
    expect(databaseIndex.disconnectPostgres).toBeDefined();

    expect(databaseIndex.redis).toBeDefined();
    expect(databaseIndex.connectRedis).toBeDefined();
    expect(databaseIndex.disconnectRedis).toBeDefined();

    expect(databaseIndex.mongoose).toBeDefined();
    expect(databaseIndex.connectMongo).toBeDefined();
    expect(databaseIndex.disconnectMongo).toBeDefined();

    expect(databaseIndex.elasticsearch).toBeDefined();
    expect(databaseIndex.connectElasticsearch).toBeDefined();
    expect(databaseIndex.disconnectElasticsearch).toBeDefined();
  });

  it('should call exported functions correctly', () => {
    const mockConnectPostgres = jest.fn().mockResolvedValue(undefined);
    const mockDisconnectPostgres = jest.fn().mockResolvedValue(undefined);
    const mockConnectRedis = jest.fn().mockResolvedValue(undefined);
    const mockDisconnectRedis = jest.fn().mockResolvedValue(undefined);
    const mockConnectMongo = jest.fn().mockResolvedValue(undefined);
    const mockDisconnectMongo = jest.fn().mockResolvedValue(undefined);
    const mockConnectElasticsearch = jest.fn().mockResolvedValue(undefined);
    const mockDisconnectElasticsearch = jest.fn().mockResolvedValue(undefined);

    jest.doMock('@/shared/database/sequelize', () => ({
      sequelize: {},
      connectPostgres: mockConnectPostgres,
      disconnectPostgres: mockDisconnectPostgres,
    }));

    jest.doMock('@/shared/database/redis', () => ({
      redis: {},
      connectRedis: mockConnectRedis,
      disconnectRedis: mockDisconnectRedis,
    }));

    jest.doMock('@/shared/database/mongo', () => ({
      mongoose: {},
      connectMongo: mockConnectMongo,
      disconnectMongo: mockDisconnectMongo,
    }));

    jest.doMock('@/shared/database/elasticsearch', () => ({
      elasticsearch: {},
      connectElasticsearch: mockConnectElasticsearch,
      disconnectElasticsearch: mockDisconnectElasticsearch,
    }));

    const {
      connectPostgres,
      disconnectPostgres,
      connectRedis,
      disconnectRedis,
      connectMongo,
      disconnectMongo,
      connectElasticsearch,
      disconnectElasticsearch,
    } = require('@/shared/database');

    connectPostgres();
    disconnectPostgres();
    connectRedis();
    disconnectRedis();
    connectMongo();
    disconnectMongo();
    connectElasticsearch();
    disconnectElasticsearch();

    expect(mockConnectPostgres).toHaveBeenCalled();
    expect(mockDisconnectPostgres).toHaveBeenCalled();
    expect(mockConnectRedis).toHaveBeenCalled();
    expect(mockDisconnectRedis).toHaveBeenCalled();
    expect(mockConnectMongo).toHaveBeenCalled();
    expect(mockDisconnectMongo).toHaveBeenCalled();
    expect(mockConnectElasticsearch).toHaveBeenCalled();
    expect(mockDisconnectElasticsearch).toHaveBeenCalled();
  });
});
