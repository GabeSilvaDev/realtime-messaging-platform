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
import { registerChatListeners } from './modules/chat/listeners';

export async function bootstrap(): Promise<void> {
  await connectPostgres();
  await connectRedis();
  await connectMongo();
  await connectElasticsearch();
  registerChatListeners();
}

export async function shutdown(): Promise<void> {
  await disconnectElasticsearch();
  await disconnectMongo();
  await disconnectRedis();
  await disconnectPostgres();
}
