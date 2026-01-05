const mockHealth = jest.fn().mockResolvedValue({ status: 'green' });
const mockClose = jest.fn().mockResolvedValue(undefined);

jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    cluster: {
      health: mockHealth,
    },
    close: mockClose,
  })),
}));

jest.mock('@/shared/config/database', () => ({
  default: {
    elasticsearch: {
      node: 'http://localhost:9200',
      auth: {
        username: 'elastic',
        password: 'password',
      },
      tls: {
        rejectUnauthorized: false,
      },
    },
  },
  __esModule: true,
}));

import {
  elasticsearch,
  connectElasticsearch,
  disconnectElasticsearch,
} from '@/shared/database/elasticsearch';

describe('Elasticsearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('elasticsearch client', () => {
    it('should export the elasticsearch client', () => {
      expect(elasticsearch).toBeDefined();
    });
  });

  describe('connectElasticsearch', () => {
    it('should call cluster.health to test connection', async () => {
      await connectElasticsearch();

      expect(mockHealth).toHaveBeenCalledWith({});
    });
  });

  describe('disconnectElasticsearch', () => {
    it('should close the elasticsearch connection', async () => {
      await disconnectElasticsearch();

      expect(mockClose).toHaveBeenCalled();
    });
  });
});
