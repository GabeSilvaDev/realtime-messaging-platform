import type { IMessageService } from '@/modules/chat/interfaces';
import { messageService } from '@/modules/chat/services/MessageService';
import type { IndexableMessage } from '@/modules/chat/types';
import type { estypes } from '@elastic/elasticsearch';
import { elasticsearch } from '@/shared/database/elasticsearch';
import { logger } from '@/shared/logger';
import { MESSAGES_INDEX_MAPPINGS, MESSAGES_INDEX_SETTINGS, SEARCH_CONSTANTS } from '../constants';
import type { ISearchIndexService } from '../interfaces';
import type { MessageDocument, ReindexOptions, ReindexResult, SearchClient } from '../types';

export interface SearchIndexServiceOptions {
  /** @default o cliente `elasticsearch` da aplicação */
  client?: SearchClient;
  /** @default SEARCH_CONSTANTS.MESSAGES_INDEX */
  index?: string;
  /** Varredura das mensagens (reindex). @default messageService */
  messages?: Pick<IMessageService, 'forEachForIndexing'>;
  /** @default SEARCH_CONSTANTS.REINDEX_BATCH */
  batchSize?: number;
}

/** Erro do Elasticsearch com o `type` informado (`meta.body.error.type` do `ResponseError`). */
function hasErrorType(error: unknown, type: string): boolean {
  const meta = (error as { meta?: { body?: { error?: { type?: unknown } } } }).meta;
  return meta?.body?.error?.type === type;
}

/** Uma linha do corpo NDJSON do `bulk`: ação (`index`/`delete`) ou o documento da ação `index`. */
type BulkLine = estypes.BulkOperationContainer | MessageDocument;

function toDocument(message: IndexableMessage, content: string): MessageDocument {
  return {
    messageId: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content,
    createdAt: message.createdAt.toISOString(),
  };
}

/** Índice de mensagens no Elasticsearch: criação, indexação unitária e reindex em lotes. */
export class SearchIndexService implements ISearchIndexService {
  private readonly client: SearchClient;
  private readonly index: string;
  private readonly messages: Pick<IMessageService, 'forEachForIndexing'>;
  private readonly batchSize: number;

  constructor({
    client = elasticsearch,
    index = SEARCH_CONSTANTS.MESSAGES_INDEX,
    messages = messageService,
    batchSize = SEARCH_CONSTANTS.REINDEX_BATCH,
  }: SearchIndexServiceOptions = {}) {
    this.client = client;
    this.index = index;
    this.messages = messages;
    this.batchSize = batchSize;
  }

  /**
   * Instala (sempre, idempotente) o template `<índice>-template` e cria o índice se faltar. O
   * template existe porque o Elasticsearch cria na hora um índice ausente ao receber uma escrita
   * (`action.auto_create_index`): sem ele, uma indexação que chegasse com o índice apagado (o
   * `--recreate` com a aplicação no ar, ou o índice removido à mão) o criaria com mapping
   * dinâmico — sem o `pt_folded` e com `conversationId` como `text` —, e este método, vendo o
   * índice existir, nunca o corrigiria. Com o template, a criação automática recebe os mesmos
   * settings e mapping do `create`.
   */
  async ensureIndex(): Promise<boolean> {
    await this.client.indices.putIndexTemplate({
      name: `${this.index}-template`,
      index_patterns: [this.index],
      priority: SEARCH_CONSTANTS.INDEX_TEMPLATE_PRIORITY,
      template: { settings: MESSAGES_INDEX_SETTINGS, mappings: MESSAGES_INDEX_MAPPINGS },
    });
    if (await this.client.indices.exists({ index: this.index })) {
      return false;
    }
    try {
      await this.client.indices.create({
        index: this.index,
        settings: MESSAGES_INDEX_SETTINGS,
        mappings: MESSAGES_INDEX_MAPPINGS,
      });
    } catch (error) {
      // Outra instância criou o índice entre o `exists` e o `create`: o resultado é o mesmo.
      if (hasErrorType(error, 'resource_already_exists_exception')) {
        return false;
      }
      throw error;
    }
    logger.info('Índice de busca criado', { index: this.index });
    return true;
  }

  async indexMessage(document: MessageDocument): Promise<void> {
    // Sem refresh forçado: a mensagem aparece na busca no próximo refresh do índice (~1 s).
    await this.client.index({
      index: this.index,
      id: document.messageId,
      document,
      refresh: false,
    });
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.client.delete({ index: this.index, id: messageId }, { ignore: [404] });
  }

  async reindexAll({ recreate = false }: ReindexOptions = {}): Promise<ReindexResult> {
    if (recreate) {
      // Uma escrita que chegue entre o delete e o ensureIndex recria o índice pelo template
      // (instalado no bootstrap), já com o mapping certo; o ensureIndex então só o encontra.
      await this.client.indices.delete({ index: this.index, ignore_unavailable: true });
    }
    await this.ensureIndex();

    const result: ReindexResult = { scanned: 0, indexed: 0, deleted: 0, failed: 0 };
    result.scanned = await this.messages.forEachForIndexing(this.batchSize, (batch) =>
      this.syncBatch(batch, result)
    );
    return result;
  }

  /** Um `bulk` por lote: indexa as mensagens com texto e remove as apagadas. */
  private async syncBatch(batch: IndexableMessage[], result: ReindexResult): Promise<void> {
    const operations = batch.flatMap<BulkLine>((message) =>
      message.text === null
        ? [{ delete: { _index: this.index, _id: message.id } }]
        : [{ index: { _index: this.index, _id: message.id } }, toDocument(message, message.text)]
    );
    const response = await this.client.bulk({ operations });

    for (const item of response.items) {
      const outcome = item.index ?? item.delete;
      if (outcome?.error !== undefined) {
        result.failed++;
        logger.error('Falha ao indexar mensagem no reindex da busca', undefined, {
          messageId: outcome._id,
          status: outcome.status,
          reason: outcome.error,
        });
      } else if (item.index !== undefined) {
        result.indexed++;
      } else if (outcome?.status === 200) {
        // 404 = a apagada já não estava no índice (nada a contar).
        result.deleted++;
      }
    }
  }
}

export const searchIndexService = new SearchIndexService();
