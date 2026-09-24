jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createJoinRoomsMiddleware } from '@/modules/realtime/middlewares/joinRooms';
import { logger } from '@/shared/logger';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const mockLogger = logger as jest.Mocked<typeof logger>;
const USER_A = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
});
