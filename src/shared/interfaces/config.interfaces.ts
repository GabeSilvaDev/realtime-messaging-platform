import type { Environment } from '../types';
import type {
  DatabaseConfig,
  RedisConfig,
  MongoConfig,
  ElasticsearchConfig,
} from './database.interfaces';

export interface Config {
  env: Environment;
  port: number;
  database: {
    development: DatabaseConfig;
    test: DatabaseConfig;
    production: DatabaseConfig;
  };
  redis: RedisConfig;
  mongo: MongoConfig;
  elasticsearch: ElasticsearchConfig;
}
