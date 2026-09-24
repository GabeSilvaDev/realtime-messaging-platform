import type { ILogger } from '@/shared/interfaces';
import type { ISearchIndexService } from '../interfaces';

export interface ReindexCommandDeps {
  /** Argumentos da linha de comando (sem `node` e o script). */
  argv: string[];
  indexer: Pick<ISearchIndexService, 'reindexAll'>;
  /** Conecta MongoDB e Elasticsearch. */
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  log: Pick<ILogger, 'info' | 'error'>;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * `npm run search:reindex [-- --recreate]`: sincroniza o índice de busca com o MongoDB.
 * Devolve o código de saída — 0 sem falhas; 1 se algum item falhou, se o reindex quebrou ou se a
 * desconexão falhou (tudo logado). Sempre desconecta.
 */
export async function runReindex({
  argv,
  indexer,
  connect,
  disconnect,
  log,
}: ReindexCommandDeps): Promise<number> {
  const recreate = argv.includes('--recreate');
  let code: number;

  try {
    await connect();
    const result = await indexer.reindexAll({ recreate });
    log.info('Reindexação da busca concluída', { ...result, recreate });
    code = result.failed > 0 ? 1 : 0;
  } catch (error) {
    log.error('Falha na reindexação da busca', toError(error), { recreate });
    code = 1;
  }

  try {
    await disconnect();
  } catch (error) {
    log.error('Falha ao desconectar do MongoDB/Elasticsearch', toError(error));
    code = 1;
  }

  return code;
}
