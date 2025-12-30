import 'dotenv/config';
import type { Environment } from '../types';
import type {
  Config,
  DatabaseConfig,
  RedisConfig,
  MongoConfig,
  ElasticsearchConfig,
} from '../interfaces';
import {
  DEFAULT_PORT,
  POSTGRES_DEFAULTS,
  REDIS_DEFAULTS,
  MONGO_DEFAULTS,
  ELASTICSEARCH_DEFAULTS,
  POOL_CONFIG,
  MONGO_OPTIONS,
} from '../constants';

const env: Environment = (process.env.NODE_ENV as Environment | undefined) ?? 'development';

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const config: Config = {
  env,
  port: Number(process.env.PORT) || DEFAULT_PORT,

  database: {
    development: {
      username: getRequiredEnv('POSTGRES_USER'),
      password: getRequiredEnv('POSTGRES_PASSWORD'),
      database: getRequiredEnv('POSTGRES_DB'),
      host: process.env.DB_HOST ?? POSTGRES_DEFAULTS.HOST,
      port: Number(process.env.DB_PORT) || POSTGRES_DEFAULTS.PORT,
      dialect: 'postgres',
      logging: false,
      define: {
        timestamps: true,
        underscored: true,
        underscoredAll: true,
      },
      pool: POOL_CONFIG.development,
    },
    test: {
      username: getRequiredEnv('POSTGRES_USER'),
      password: getRequiredEnv('POSTGRES_PASSWORD'),
      database: `${getRequiredEnv('POSTGRES_DB')}_test`,
      host: process.env.DB_HOST ?? POSTGRES_DEFAULTS.HOST,
      port: Number(process.env.DB_PORT) || POSTGRES_DEFAULTS.PORT,
      dialect: 'postgres',
      logging: false,
      define: {
        timestamps: true,
        underscored: true,
        underscoredAll: true,
      },
      pool: POOL_CONFIG.test,
    },
    production: {
      username: getRequiredEnv('POSTGRES_USER'),
      password: getRequiredEnv('POSTGRES_PASSWORD'),
      database: getRequiredEnv('POSTGRES_DB'),
      host: process.env.DB_HOST ?? POSTGRES_DEFAULTS.HOST,
      port: Number(process.env.DB_PORT) || POSTGRES_DEFAULTS.PORT,
      dialect: 'postgres',
      logging: false,
      define: {
        timestamps: true,
        underscored: true,
        underscoredAll: true,
      },
      pool: POOL_CONFIG.production,
    },
  },

  redis: {
    host: process.env.REDIS_HOST ?? REDIS_DEFAULTS.HOST,
    port: Number(process.env.REDIS_PORT) || REDIS_DEFAULTS.PORT,
    password: getRequiredEnv('REDIS_PASSWORD'),
  },

  mongo: {
    uri:
      process.env.MONGODB_URL ??
      `mongodb://${encodeURIComponent(getRequiredEnv('MONGO_USER'))}:${encodeURIComponent(getRequiredEnv('MONGO_PASSWORD'))}@${MONGO_DEFAULTS.HOST}:${String(MONGO_DEFAULTS.PORT)}/${getRequiredEnv('MONGO_DB')}?authSource=admin`,
    options: MONGO_OPTIONS,
  },

  elasticsearch: {
    node:
      process.env.ELASTICSEARCH_URL ??
      `http://${ELASTICSEARCH_DEFAULTS.HOST}:${String(ELASTICSEARCH_DEFAULTS.PORT)}`,
    ...(process.env.ELASTIC_PASSWORD !== undefined &&
      process.env.ELASTIC_PASSWORD !== '' && {
        auth: {
          username: 'elastic',
          password: process.env.ELASTIC_PASSWORD,
        },
      }),
    tls: {
      rejectUnauthorized: false,
    },
  },
};

export default config;
export type { Config, DatabaseConfig, RedisConfig, MongoConfig, ElasticsearchConfig, Environment };
