const mockHealth = jest.fn().mockResolvedValue({ status: 'green' });
const mockClose = jest.fn().mockResolvedValue(undefined);

/** Opções de cada `new Client(...)` (o cliente é criado na carga do módulo, antes dos testes). */
const mockClientOptions: unknown[] = [];

jest.mock('@elastic/elasticsearch', () => ({
  Client: class {
    readonly cluster = { health: mockHealth };
    readonly close = mockClose;

    constructor(options: unknown) {
      mockClientOptions.push(options);
    }
  },
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

    it('should be created from the config with a 10 s request timeout (not the 10 min default)', () => {
      expect(mockClientOptions).toEqual([
        {
          node: 'http://localhost:9200',
          auth: { username: 'elastic', password: 'password' },
          tls: { rejectUnauthorized: false },
          requestTimeout: 10_000,
        },
      ]);
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
