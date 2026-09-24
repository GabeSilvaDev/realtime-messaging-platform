jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/database/elasticsearch', () => ({ elasticsearch: {} }));
jest.mock('@/shared/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

import { registerSearchIndexListeners } from '@/modules/search/listeners';
import { SearchIndexService } from '@/modules/search/services';
import { EventBus } from '@/shared/event-bus/EventBus';
import type { EventPayload } from '@/shared/interfaces';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import { FakeSearchClient } from '../../../../support/elasticsearch/fakeSearchClient';

const INDEX = 'messages';
const MESSAGE_ID = '65f000000000000000000001';
const CONVERSATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CREATED_AT = new Date('2026-09-27T10:00:00.000Z');

/** Os listeners são `{ async: true }`: rodam num setImmediate depois do publish. */
async function flushDetached(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function messageSent(text = 'Meu coração'): EventPayload<ChatEvents.MESSAGE_SENT> {
  return {
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION,
    conversationType: 'direct',
    senderId: ANA,
    text,
    mentions: [],
    replyTo: null,
    createdAt: CREATED_AT,
    participantIds: [ANA, BOB],
    message: {
      id: MESSAGE_ID,
      conversationId: CONVERSATION,
      senderId: ANA,
      content: { type: 'text', text },
      replyTo: null,
      mentions: [],
      clientMessageId: null,
      status: { sentAt: CREATED_AT, deliveredTo: [], readBy: [] },
      deletedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  };
}

const messageDeleted = { messageId: MESSAGE_ID, conversationId: CONVERSATION, deletedBy: ANA };

describe('registerSearchIndexListeners (MessageIndexer)', () => {
  let bus: EventBus;
  let fake: FakeSearchClient;
  let unregister: () => void;

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    fake = new FakeSearchClient();
    unregister = registerSearchIndexListeners(
      bus,
      new SearchIndexService({ client: fake.client, index: INDEX })
    );
  });

  afterEach(() => {
    unregister();
    EventBus.resetInstance();
  });

  it('chat:message-sent indexa a mensagem (fora do caminho de quem publica)', async () => {
    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());

    // O publish já voltou e a indexação ainda não rodou: ela não atrasa o envio.
    expect(fake.calls).toEqual([]);
    await flushDetached();

    expect(fake.documents(INDEX)).toEqual([
      {
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION,
        senderId: ANA,
        content: 'Meu coração',
        createdAt: '2026-09-27T10:00:00.000Z',
      },
    ]);
  });

  it('chat:message-deleted remove do índice (e apagar de novo não é erro)', async () => {
    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await flushDetached();

    await bus.publish(ChatEvents.MESSAGE_DELETED, messageDeleted);
    await bus.publish(ChatEvents.MESSAGE_DELETED, messageDeleted);
    await flushDetached();

    expect(fake.documents(INDEX)).toEqual([]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('falhas são logadas com o messageId e nunca propagam', async () => {
    fake.failWith = new Error('connect ECONNREFUSED');

    await expect(bus.publish(ChatEvents.MESSAGE_SENT, messageSent())).resolves.toEqual(
      expect.any(String)
    );
    await bus.publish(ChatEvents.MESSAGE_DELETED, messageDeleted);
    await flushDetached();

    expect(logger.error).toHaveBeenCalledWith(
      'Falha ao indexar a mensagem na busca',
      fake.failWith,
      { messageId: MESSAGE_ID }
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Falha ao remover a mensagem da busca',
      fake.failWith,
      { messageId: MESSAGE_ID }
    );
  });

  it('rejeição que não é Error vira Error no log', async () => {
    unregister();
    unregister = registerSearchIndexListeners(bus, {
      indexMessage: () => Promise.reject('timeout'),
      deleteMessage: () => Promise.reject('timeout'),
    });

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await bus.publish(ChatEvents.MESSAGE_DELETED, messageDeleted);
    await flushDetached();

    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(jest.mocked(logger.error).mock.calls[0]?.[1]).toEqual(new Error('timeout'));
  });

  it('a função devolvida cancela as inscrições', async () => {
    unregister();

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await flushDetached();

    expect(fake.calls).toEqual([]);
    expect(bus.hasSubscribers(ChatEvents.MESSAGE_SENT)).toBe(false);
    expect(bus.hasSubscribers(ChatEvents.MESSAGE_DELETED)).toBe(false);
  });

  it('usa o eventBus e o searchIndexService padrão quando nada é injetado', () => {
    const unregisterDefault = registerSearchIndexListeners();

    expect(typeof unregisterDefault).toBe('function');
    unregisterDefault();
  });
});
