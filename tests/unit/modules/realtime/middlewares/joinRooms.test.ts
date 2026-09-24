jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  createJoinRoomsMiddleware,
  reconcileConversationRooms,
} from '@/modules/realtime/middlewares/joinRooms';
import { logger } from '@/shared/logger';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const mockLogger = logger as jest.Mocked<typeof logger>;
const USER_A = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONVERSATION_3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

async function run(
  middleware: ReturnType<typeof createJoinRoomsMiddleware>,
  socket: FakeSocket
): Promise<unknown[]> {
  return new Promise((resolve) => {
    middleware(socket.asSocket(), (...args: unknown[]) => {
      resolve(args);
    });
  });
}

describe('joinRooms', () => {
  let conversations: { getUserConversationIds: jest.Mock };
  let socket: FakeSocket;

  beforeEach(() => {
    conversations = { getUserConversationIds: jest.fn() };
    socket = createFakeSocket({ data: { userId: USER_A, ip: null, device: null } });
  });

  it('entra na room do usuário e nas de todas as conversas antes de concluir o handshake', async () => {
    conversations.getUserConversationIds.mockResolvedValue([CONVERSATION_1, CONVERSATION_2]);

    const args = await run(createJoinRoomsMiddleware(conversations), socket);

    expect(conversations.getUserConversationIds).toHaveBeenCalledWith(USER_A);
    expect(socket.join).toHaveBeenCalledWith([
      `user:${USER_A}`,
      `conversation:${CONVERSATION_1}`,
      `conversation:${CONVERSATION_2}`,
    ]);
    expect(args).toEqual([]);
  });

  it('falha ao carregar as conversas: recusa com INTERNAL_ERROR e loga', async () => {
    const dbError = new Error('db down');
    conversations.getUserConversationIds.mockRejectedValue(dbError);

    const [error] = await run(createJoinRoomsMiddleware(conversations), socket);

    expect(error).toEqual(expect.objectContaining({ message: 'INTERNAL_ERROR' }));
    expect(socket.join).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), dbError, {
      userId: USER_A,
    });
  });

  it('envolve rejeições que não são Error antes de logar', async () => {
    conversations.getUserConversationIds.mockRejectedValue('falhou');

    await run(createJoinRoomsMiddleware(conversations), socket);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: 'falhou' }),
      { userId: USER_A }
    );
  });

  it('usa o conversationService padrão quando nada é injetado', () => {
    expect(typeof createJoinRoomsMiddleware()).toBe('function');
  });

  describe('reconcileConversationRooms (na conexão)', () => {
    beforeEach(() => {
      // Estado deixado pelo middleware: rooms do usuário e das conversas lidas no handshake.
      socket.rooms.add(`user:${USER_A}`);
      socket.rooms.add(`conversation:${CONVERSATION_1}`);
      socket.rooms.add(`conversation:${CONVERSATION_2}`);
      socket.join.mockClear();
    });

    it('participação mudou entre o middleware e a conexão: sai das removidas e entra nas novas', async () => {
      conversations.getUserConversationIds.mockResolvedValue([CONVERSATION_2, CONVERSATION_3]);

      await reconcileConversationRooms(socket.asSocket(), conversations);

      expect(conversations.getUserConversationIds).toHaveBeenCalledWith(USER_A);
      expect(socket.leave).toHaveBeenCalledTimes(1);
      expect(socket.leave).toHaveBeenCalledWith(`conversation:${CONVERSATION_1}`);
      expect(socket.join).toHaveBeenCalledWith([`conversation:${CONVERSATION_3}`]);
      expect([...socket.rooms].sort()).toEqual(
        [
          socket.id,
          `user:${USER_A}`,
          `conversation:${CONVERSATION_2}`,
          `conversation:${CONVERSATION_3}`,
        ].sort()
      );
    });

    it('sem mudança: não entra nem sai de nada', async () => {
      conversations.getUserConversationIds.mockResolvedValue([CONVERSATION_1, CONVERSATION_2]);

      await reconcileConversationRooms(socket.asSocket(), conversations);

      expect(socket.leave).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('usa o retrato das rooms de antes da leitura: um socketsLeave durante a leitura não é desfeito', async () => {
      conversations.getUserConversationIds.mockImplementation(() => {
        // A ponte remove o socket da conversa 1 enquanto a leitura (ainda sem o commit) roda.
        socket.rooms.delete(`conversation:${CONVERSATION_1}`);
        return Promise.resolve([CONVERSATION_1, CONVERSATION_2]);
      });

      await reconcileConversationRooms(socket.asSocket(), conversations);

      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.rooms.has(`conversation:${CONVERSATION_1}`)).toBe(false);
    });

    it('socket desconectou durante a leitura: não mexe nas rooms', async () => {
      conversations.getUserConversationIds.mockImplementation(() => {
        socket.connected = false;
        return Promise.resolve([CONVERSATION_3]);
      });

      await reconcileConversationRooms(socket.asSocket(), conversations);

      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.leave).not.toHaveBeenCalled();
    });

    it('falha ao reler as conversas: loga e desconecta (não arrisca manter rooms revogadas)', async () => {
      const dbError = new Error('db down');
      conversations.getUserConversationIds.mockRejectedValue(dbError);

      await expect(
        reconcileConversationRooms(socket.asSocket(), conversations)
      ).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), dbError, {
        userId: USER_A,
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('envolve rejeições que não são Error antes de logar', async () => {
      conversations.getUserConversationIds.mockRejectedValue('falhou');

      await reconcileConversationRooms(socket.asSocket(), conversations);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: 'falhou' }),
        { userId: USER_A }
      );
    });
  });
});
