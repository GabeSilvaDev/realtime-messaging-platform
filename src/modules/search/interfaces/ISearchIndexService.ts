import type { MessageDocument, ReindexOptions, ReindexResult } from '../types';

export interface ISearchIndexService {
  /**
   * Instala (a cada chamada) o template do índice — para que uma criação automática por escrita
   * receba o mesmo mapping — e cria o índice de mensagens (settings + mapping) se ainda não
   * existe; se existe, não mexe. Idempotente também sob corrida entre instâncias. Devolve `true`
   * só quando criou.
   */
  ensureIndex(): Promise<boolean>;
  /** Indexa (ou sobrescreve) o documento com `_id = messageId`, sem forçar refresh. */
  indexMessage(document: MessageDocument): Promise<void>;
  /** Remove a mensagem do índice; documento ausente não é erro. */
  deleteMessage(messageId: string): Promise<void>;
  /**
   * Percorre todas as mensagens do MongoDB em lotes e sincroniza o índice via `bulk`: indexa as
   * não apagadas e remove as apagadas (idempotente). `recreate` apaga e recria o índice antes.
   */
  reindexAll(options?: ReindexOptions): Promise<ReindexResult>;
}
