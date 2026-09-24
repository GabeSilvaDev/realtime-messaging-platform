jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { ConversationNotFoundException } from '@/modules/chat/errors';
import { registerTypingHandlers } from '@/modules/realtime/handlers/typingHandlers';
import { TypingService } from '@/modules/realtime/services/TypingService';
import type { AckResponse } from '@/modules/realtime/types';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const USER_A = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CONVERSATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROOM = `conversation:${CONVERSATION_ID}`;

function emit(socket: FakeSocket, event: string, payload: unknown): Promise<AckResponse<unknown>> {
  const handler = socket.handlers.get(event);
  if (handler === undefined) {
    throw new Error(`handler ${event} não registrado`);
  }
  return new Promise((resolve) => {
    handler(payload, resolve);
  });
}

function indicator(conversationId: string, isTyping: boolean): [string, string, unknown] {
  return [
    `conversation:${conversationId}`,
    'typing:indicator',
    { conversationId, userId: USER_A, isTyping },
  ];
}

describe('registerTypingHandlers', () => {
  let socket: FakeSocket;
  let conversations: { getTypeForParticipant: jest.Mock };
  let typing: TypingService;

  beforeEach(() => {
    jest.useFakeTimers();
    socket = createFakeSocket({ data: { userId: USER_A, ip: null, device: null } });
    conversations = { getTypeForParticipant: jest.fn().mockResolvedValue('direct') };
    typing = new TypingService(3000);
    registerTypingHandlers(socket.asSocket(), { conversations, typing });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registra typing:start, typing:stop e a limpeza no disconnecting', () => {
    expect([...socket.handlers.keys()]).toEqual(['typing:start', 'typing:stop', 'disconnecting']);
  });

  it('typing:start em direct emite isTyping=true para a room, exceto o próprio socket', async () => {
    const response = await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });

    expect(response).toEqual({ ok: true, data: null });
    expect(conversations.getTypeForParticipant).toHaveBeenCalledWith(USER_A, CONVERSATION_ID);
    expect(socket.to).toHaveBeenCalledWith(ROOM);
    expect(socket.broadcasts).toEqual([indicator(CONVERSATION_ID, true)]);
  });

  it('starts repetidos só renovam o timer (sem nova emissão nem nova consulta)', async () => {
    await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });
    jest.advanceTimersByTime(2000);
    await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });
    jest.advanceTimersByTime(2000);

    expect(conversations.getTypeForParticipant).toHaveBeenCalledTimes(1);
    expect(socket.broadcasts).toEqual([indicator(CONVERSATION_ID, true)]);
  });

  it('expira em 3s sem novo start e emite isTyping=false', async () => {
    await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });

    jest.advanceTimersByTime(3000);

    expect(socket.broadcasts).toEqual([
      indicator(CONVERSATION_ID, true),
      indicator(CONVERSATION_ID, false),
    ]);
  });

  it('typing:stop encerra e emite isTyping=false; sem indicador ativo não emite', async () => {
    await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });

    const stopped = await emit(socket, 'typing:stop', { conversationId: CONVERSATION_ID });
    const again = await emit(socket, 'typing:stop', { conversationId: CONVERSATION_ID });
    jest.advanceTimersByTime(5000);

    expect(stopped).toEqual({ ok: true, data: null });
    expect(again).toEqual({ ok: true, data: null });
    expect(socket.broadcasts).toEqual([
      indicator(CONVERSATION_ID, true),
      indicator(CONVERSATION_ID, false),
    ]);
  });

  it('grupo: responde 400 e não emite', async () => {
    conversations.getTypeForParticipant.mockResolvedValue('group');

    const response = await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });

    expect(response).toEqual({
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Indicador de digitação disponível apenas em conversas 1:1',
        statusCode: 400,
      },
    });
    expect(socket.broadcasts).toEqual([]);
    expect(typing.activeCount).toBe(0);
  });

  it('não participante: responde 404 e não emite', async () => {
    conversations.getTypeForParticipant.mockRejectedValue(new ConversationNotFoundException());

    const response = await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });

    expect(response).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }),
    });
    expect(socket.broadcasts).toEqual([]);
  });

  it('payload inválido responde 400', async () => {
    const start = await emit(socket, 'typing:start', { conversationId: 'x' });
    const stop = await emit(socket, 'typing:stop', {});

    expect(start).toEqual(expect.objectContaining({ ok: false }));
    expect(stop).toEqual(expect.objectContaining({ ok: false }));
  });

  it('disconnecting encerra todos os indicadores do socket (isTyping=false em cada conversa)', async () => {
    await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });
    await emit(socket, 'typing:start', { conversationId: OTHER_CONVERSATION_ID });

    socket.handlers.get('disconnecting')!();
    jest.advanceTimersByTime(5000);

    expect(socket.broadcasts).toEqual([
      indicator(CONVERSATION_ID, true),
      indicator(OTHER_CONVERSATION_ID, true),
      indicator(CONVERSATION_ID, false),
      indicator(OTHER_CONVERSATION_ID, false),
    ]);
    expect(typing.activeCount).toBe(0);
  });
});
