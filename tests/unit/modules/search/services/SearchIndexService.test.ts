jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/database/elasticsearch', () => ({ elasticsearch: {} }));
jest.mock('@/shared/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

import type { IndexableMessage } from '@/modules/chat/types';
import {
  MESSAGES_INDEX_MAPPINGS,
  MESSAGES_INDEX_SETTINGS,
  SEARCH_CONSTANTS,
} from '@/modules/search/constants';
import { SearchIndexService, searchIndexService } from '@/modules/search/services';
import type { MessageDocument } from '@/modules/search/types';
import { logger } from '@/shared/logger';
import {
  FakeResponseError,
  FakeSearchClient,
} from '../../../../support/elasticsearch/fakeSearchClient';

const INDEX = 'messages-test';
const CONVERSATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-4111-8111-111111111111';
const CREATED_AT = new Date('2026-09-27T10:00:00.000Z');

function message(id: string, text: string | null = `texto ${id}`): IndexableMessage {
  return { id, conversationId: CONVERSATION, senderId: ANA, text, createdAt: CREATED_AT };
}

function document(id: string, content = `texto ${id}`): MessageDocument {
  return {
    messageId: id,
    conversationId: CONVERSATION,
    senderId: ANA,
    content,
    createdAt: CREATED_AT.toISOString(),
  };
}

/** Varredura do chat em memória: entrega `all` em lotes de `batchSize`, como o MessageService. */
function scanner(all: IndexableMessage[]): { forEachForIndexing: jest.Mock } {
  return {
    forEachForIndexing: jest.fn(
      async (batchSize: number, handler: (batch: IndexableMessage[]) => Promise<void>) => {
        for (let start = 0; start < all.length; start += batchSize) {
          await handler(all.slice(start, start + batchSize));
        }
        return all.length;
      }
    ),
  };
}

describe('SearchIndexService', () => {
  let fake: FakeSearchClient;

  beforeEach(() => {
    fake = new FakeSearchClient();
  });

  function service(all: IndexableMessage[] = [], batchSize = 2): SearchIndexService {
    return new SearchIndexService({
      client: fake.client,
      index: INDEX,
      messages: scanner(all),
      batchSize,
    });
  }

  it('exporta a instância padrão (cliente da aplicação, índice das constantes)', () => {
    expect(searchIndexService).toBeInstanceOf(SearchIndexService);
    expect(SEARCH_CONSTANTS.MESSAGES_INDEX).toBe('messages');
  });

  describe('ensureIndex', () => {
    const TEMPLATE = {
      name: `${INDEX}-template`,
      index_patterns: [INDEX],
      priority: 500,
      template: { settings: MESSAGES_INDEX_SETTINGS, mappings: MESSAGES_INDEX_MAPPINGS },
    };

    it('instala o template do índice (settings + mapping) antes de verificar/criar o índice', async () => {
      await service().ensureIndex();

      expect(fake.calls.map((call) => call.method)).toEqual([
        'indices.putIndexTemplate',
        'indices.exists',
        'indices.create',
      ]);
      expect(fake.callsOf('indices.putIndexTemplate')).toEqual([
        { method: 'indices.putIndexTemplate', params: TEMPLATE },
      ]);
    });

    it('reinstala o template a cada chamada, mesmo com o índice já existente', async () => {
      await service().ensureIndex();
      await service().ensureIndex();

      expect(fake.callsOf('indices.putIndexTemplate').map((call) => call.params)).toEqual([
        TEMPLATE,
        TEMPLATE,
      ]);
      expect(fake.callsOf('indices.create')).toHaveLength(1);
    });

    it('índice apagado com a aplicação no ar: a escrita seguinte o recria com o mapping certo', async () => {
      await service().ensureIndex();
      await fake.indices.delete({ index: INDEX });

      await service().indexMessage(document('m1'));

      expect(fake.hasIndex(INDEX)).toBe(true);
      expect(fake.mappingOf(INDEX)).toEqual(MESSAGES_INDEX_MAPPINGS);
      expect(fake.documents(INDEX)).toEqual([document('m1')]);
    });

    it('falha ao instalar o template propaga (sem tentar criar o índice)', async () => {
      jest
        .spyOn(fake.indices, 'putIndexTemplate')
        .mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(service().ensureIndex()).rejects.toThrow('ECONNREFUSED');
      expect(fake.callsOf('indices.exists')).toEqual([]);
    });

    it('cria o índice com settings e mapping quando não existe', async () => {
      await expect(service().ensureIndex()).resolves.toBe(true);

      expect(fake.callsOf('indices.create')).toEqual([
        {
          method: 'indices.create',
          params: {
            index: INDEX,
            settings: MESSAGES_INDEX_SETTINGS,
            mappings: MESSAGES_INDEX_MAPPINGS,
          },
        },
      ]);
      expect(logger.info).toHaveBeenCalledWith('Índice de busca criado', { index: INDEX });
    });

    it('idempotente: índice existente não é recriado nem alterado', async () => {
      await service().ensureIndex();

      await expect(service().ensureIndex()).resolves.toBe(false);
      expect(fake.callsOf('indices.create')).toHaveLength(1);
    });

    it('corrida entre instâncias: resource_already_exists_exception no create vale como existente', async () => {
      await fake.indices.create({ index: INDEX });
      // Outra instância criou o índice entre o `exists` e o `create` desta.
      jest.spyOn(fake.indices, 'exists').mockResolvedValue(false);

      await expect(service().ensureIndex()).resolves.toBe(false);
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('Elasticsearch fora do ar → propaga', async () => {
      fake.failWith = new Error('connect ECONNREFUSED');

      await expect(service().ensureIndex()).rejects.toThrow('ECONNREFUSED');
    });

    it('erro do create que não é "já existe" propaga', async () => {
      jest.spyOn(fake.indices, 'create').mockRejectedValue(
        new FakeResponseError(400, {
          error: { type: 'illegal_argument_exception', reason: 'analyzer inválido' },
        })
      );

      await expect(service().ensureIndex()).rejects.toMatchObject({
        meta: { body: { error: { type: 'illegal_argument_exception' } } },
      });
    });
  });

  describe('indexMessage/deleteMessage', () => {
    it('indexa com _id = messageId e refresh: false', async () => {
      await service().indexMessage(document('m1'));

      expect(fake.callsOf('index')).toEqual([
        {
          method: 'index',
          params: { index: INDEX, id: 'm1', document: document('m1'), refresh: false },
        },
      ]);
      expect(fake.documents(INDEX)).toEqual([document('m1')]);
    });

    it('remove do índice; documento ausente (404) não é erro', async () => {
      await service().indexMessage(document('m1'));

      await service().deleteMessage('m1');
      await expect(service().deleteMessage('m1')).resolves.toBeUndefined();

      expect(fake.documents(INDEX)).toEqual([]);
      expect(fake.callsOf('delete')[0]).toEqual({
        method: 'delete',
        params: { index: INDEX, id: 'm1' },
        options: { ignore: [404] },
      });
    });

    it('Elasticsearch fora do ar → rejeita (quem chama loga)', async () => {
      fake.failWith = new Error('connect ECONNREFUSED');

      await expect(service().indexMessage(document('m1'))).rejects.toThrow('ECONNREFUSED');
      await expect(service().deleteMessage('m1')).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('reindexAll', () => {
    it('garante o índice e indexa em lotes via bulk; apagadas viram delete', async () => {
      await fake.index({ index: INDEX, id: 'm3', document: document('m3') });
      const all = [message('m1'), message('m2'), message('m3', null), message('m4')];
      const indexer = new SearchIndexService({
        client: fake.client,
        index: INDEX,
        messages: scanner(all),
        batchSize: 2,
      });

      const result = await indexer.reindexAll();

      expect(result).toEqual({ scanned: 4, indexed: 3, deleted: 1, failed: 0 });
      expect(
        fake
          .documents(INDEX)
          .map((doc) => doc.messageId)
          .sort()
      ).toEqual(['m1', 'm2', 'm4']);
      expect(fake.callsOf('bulk').map((call) => call.params)).toEqual([
        {
          operations: [
            { index: { _index: INDEX, _id: 'm1' } },
            document('m1'),
            { index: { _index: INDEX, _id: 'm2' } },
            document('m2'),
          ],
        },
        {
          operations: [
            { delete: { _index: INDEX, _id: 'm3' } },
            { index: { _index: INDEX, _id: 'm4' } },
            document('m4'),
          ],
        },
      ]);
      expect(fake.callsOf('indices.delete')).toEqual([]);
    });

    it('idempotente: rodar de novo sobrescreve; apagada que já não estava lá não conta', async () => {
      const all = [message('m1'), message('m2', null)];

      await service(all).reindexAll();
      const again = await service(all).reindexAll();

      expect(again).toEqual({ scanned: 2, indexed: 1, deleted: 0, failed: 0 });
      expect(fake.documents(INDEX)).toEqual([document('m1')]);
    });

    it('usa o lote padrão de 500 mensagens', async () => {
      const messages = scanner([]);

      await new SearchIndexService({ client: fake.client, index: INDEX, messages }).reindexAll();

      expect(messages.forEachForIndexing).toHaveBeenCalledWith(500, expect.any(Function));
    });

    it('--recreate apaga (se existir) e recria o índice antes', async () => {
      await fake.indices.create({ index: INDEX });
      await fake.index({ index: INDEX, id: 'orfa', document: document('orfa') });
      fake.calls.length = 0;

      const result = await service([message('m1')]).reindexAll({ recreate: true });

      expect(result).toEqual({ scanned: 1, indexed: 1, deleted: 0, failed: 0 });
      expect(fake.documents(INDEX)).toEqual([document('m1')]);
      expect(fake.calls.map((call) => call.method)).toEqual([
        'indices.delete',
        'indices.putIndexTemplate',
        'indices.exists',
        'indices.create',
        'bulk',
      ]);
      expect(fake.mappingOf(INDEX)).toEqual(MESSAGES_INDEX_MAPPINGS);
      expect(fake.callsOf('indices.delete')[0]?.params).toEqual({
        index: INDEX,
        ignore_unavailable: true,
      });
    });

    it('--recreate com a aplicação no ar: escrita entre o delete e o ensureIndex recria o índice pelo template', async () => {
      await service().ensureIndex(); // bootstrap da aplicação: template instalado
      const deleteIndex = fake.indices.delete;
      jest.spyOn(fake.indices, 'delete').mockImplementation(async (params) => {
        const response = await deleteIndex(params);
        // Uma mensagem nova chega (MessageIndexer) logo depois do delete.
        await service().indexMessage(document('nova'));
        return response;
      });

      const result = await service([message('m1')]).reindexAll({ recreate: true });

      expect(result).toEqual({ scanned: 1, indexed: 1, deleted: 0, failed: 0 });
      expect(fake.mappingOf(INDEX)).toEqual(MESSAGES_INDEX_MAPPINGS);
      expect(
        fake
          .documents(INDEX)
          .map((doc) => doc.messageId)
          .sort()
      ).toEqual(['m1', 'nova']);
    });

    it('--recreate com o índice ausente também funciona', async () => {
      await expect(service([]).reindexAll({ recreate: true })).resolves.toEqual({
        scanned: 0,
        indexed: 0,
        deleted: 0,
        failed: 0,
      });
      expect(fake.hasIndex(INDEX)).toBe(true);
    });

    it('erro item a item: conta, loga com o messageId e segue com os demais', async () => {
      fake.failingBulkIds.add('m2');

      const result = await service([message('m1'), message('m2'), message('m3')]).reindexAll();

      expect(result).toEqual({ scanned: 3, indexed: 2, deleted: 0, failed: 1 });
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Falha ao indexar mensagem no reindex da busca',
        undefined,
        {
          messageId: 'm2',
          status: 429,
          reason: { type: 'es_rejected_execution_exception', reason: 'fila de escrita cheia' },
        }
      );
    });

    it('bulk rejeitado inteiro (Elasticsearch fora do ar) interrompe e propaga', async () => {
      jest.spyOn(fake, 'bulk').mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(
        service([message('m1'), message('m2'), message('m3')]).reindexAll()
      ).rejects.toThrow('ECONNREFUSED');
      expect(fake.bulk).toHaveBeenCalledTimes(1);
    });
  });
});
