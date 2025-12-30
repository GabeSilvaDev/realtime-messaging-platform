export const DEFAULT_PORT = 3000;

export const POSTGRES_DEFAULTS = {
  HOST: 'postgres',
  PORT: 5432,
} as const;

export const REDIS_DEFAULTS = {
  HOST: 'redis',
  PORT: 6379,
} as const;

export const MONGO_DEFAULTS = {
  HOST: 'mongodb',
  PORT: 27017,
} as const;

export const ELASTICSEARCH_DEFAULTS = {
  HOST: 'elasticsearch',
  PORT: 9200,
} as const;

export const POOL_CONFIG = {
  development: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  test: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  production: {
    max: 20,
    min: 5,
    acquire: 30000,
    idle: 10000,
  },
} as const;

export const MONGO_OPTIONS = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
} as const;
