import {
  DEFAULT_PORT,
  POSTGRES_DEFAULTS,
  REDIS_DEFAULTS,
  MONGO_DEFAULTS,
  ELASTICSEARCH_DEFAULTS,
  POOL_CONFIG,
  MONGO_OPTIONS,
} from '@/shared/constants/database.constants';

describe('Database Constants', () => {
  describe('DEFAULT_PORT', () => {
    it('should be 3000', () => {
      expect(DEFAULT_PORT).toBe(3000);
    });
  });

  describe('POSTGRES_DEFAULTS', () => {
    it('should have correct default values', () => {
      expect(POSTGRES_DEFAULTS.HOST).toBe('postgres');
      expect(POSTGRES_DEFAULTS.PORT).toBe(5432);
    });
  });

  describe('REDIS_DEFAULTS', () => {
    it('should have correct default values', () => {
      expect(REDIS_DEFAULTS.HOST).toBe('redis');
      expect(REDIS_DEFAULTS.PORT).toBe(6379);
    });
  });

  describe('MONGO_DEFAULTS', () => {
    it('should have correct default values', () => {
      expect(MONGO_DEFAULTS.HOST).toBe('mongodb');
      expect(MONGO_DEFAULTS.PORT).toBe(27017);
    });
  });

  describe('ELASTICSEARCH_DEFAULTS', () => {
    it('should have correct default values', () => {
      expect(ELASTICSEARCH_DEFAULTS.HOST).toBe('elasticsearch');
      expect(ELASTICSEARCH_DEFAULTS.PORT).toBe(9200);
    });
  });

  describe('POOL_CONFIG', () => {
    it('should have development configuration', () => {
      expect(POOL_CONFIG.development).toHaveProperty('max', 5);
      expect(POOL_CONFIG.development).toHaveProperty('min', 0);
    });

    it('should have test configuration', () => {
      expect(POOL_CONFIG.test).toHaveProperty('max', 5);
      expect(POOL_CONFIG.test).toHaveProperty('min', 0);
    });

    it('should have production configuration with higher limits', () => {
      expect(POOL_CONFIG.production).toHaveProperty('max', 20);
      expect(POOL_CONFIG.production).toHaveProperty('min', 5);
    });
  });

  describe('MONGO_OPTIONS', () => {
    it('should have correct options', () => {
      expect(MONGO_OPTIONS.maxPoolSize).toBe(10);
      expect(MONGO_OPTIONS.serverSelectionTimeoutMS).toBe(5000);
      expect(MONGO_OPTIONS.socketTimeoutMS).toBe(45000);
    });
  });
});
