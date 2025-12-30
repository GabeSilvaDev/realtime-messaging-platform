import {
  connectPostgres,
  connectRedis,
  connectMongo,
  connectElasticsearch,
  disconnectPostgres,
  disconnectRedis,
  disconnectMongo,
  disconnectElasticsearch,
} from './shared/database';

export async function bootstrap(): Promise<void> {
  await connectPostgres();
  await connectRedis();
  await connectMongo();
  await connectElasticsearch();
}

export async function shutdown(): Promise<void> {
  await disconnectElasticsearch();
  await disconnectMongo();
  await disconnectRedis();
  await disconnectPostgres();
}
