// Entrada do `npm run search:reindex [-- --recreate]` (fora da cobertura: só liga as peças; a
// lógica está em `runReindex` e `SearchIndexService.reindexAll`, ambos testados).
import { runReindex } from '../modules/search/cli';
import { searchIndexService } from '../modules/search/services/SearchIndexService';
import { connectElasticsearch, disconnectElasticsearch } from '../shared/database/elasticsearch';
import { connectMongo, disconnectMongo } from '../shared/database/mongo';
import { logger } from '../shared/logger';

void runReindex({
  argv: process.argv.slice(2),
  indexer: searchIndexService,
  connect: async () => {
    await connectMongo();
    await connectElasticsearch();
  },
  disconnect: async () => {
    await disconnectElasticsearch();
    await disconnectMongo();
  },
  log: logger,
}).then((code) => {
  process.exit(code);
});
