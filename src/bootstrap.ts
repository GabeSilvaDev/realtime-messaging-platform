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
import { registerChatCacheListeners, registerChatListeners } from './modules/chat/listeners';
import { registerPresenceCacheListeners } from './modules/presence/listeners';
import { registerSearchIndexListeners } from './modules/search/listeners';
import { searchIndexService } from './modules/search/services/SearchIndexService';
import { registerUserCacheListeners } from './modules/user/listeners';

export async function bootstrap(): Promise<void> {
  await connectPostgres();
  await connectRedis();
  await connectMongo();
  await connectElasticsearch();
  // Índice de mensagens: cria se não existe (se existe, não mexe) antes de indexar qualquer coisa.
  await searchIndexService.ensureIndex();
  registerChatListeners();
  registerSearchIndexListeners();
  // Invalidação do cache Redis por evento (perfis, bloqueios, participantes, audiência).
  registerUserCacheListeners();
  registerChatCacheListeners();
  registerPresenceCacheListeners();
}

export async function shutdown(): Promise<void> {
  await disconnectElasticsearch();
  await disconnectMongo();
  await disconnectRedis();
  await disconnectPostgres();
}
