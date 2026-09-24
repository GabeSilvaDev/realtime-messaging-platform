jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { registerMessageHandlers } from '@/modules/realtime/handlers/messageHandlers';
import type { AckResponse } from '@/modules/realtime/types';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const USER_A = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE_ID = '65f000000000000000000001';
const CLIENT_MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

function emit(socket: FakeSocket, event: string, payload: unknown): Promise<AckResponse<unknown>> {
  const handler = socket.handlers.get(event);
  if (handler === undefined) {
    throw new Error(`handler ${event} não registrado`);
  }
  return new Promise((resolve) => {
    handler(payload, resolve);
  });
}

describe('registerMessageHandlers', () => {
  let socket: FakeSocket;
  let messages: { send: jest.Mock; markDelivered: jest.Mock; markRead: jest.Mock };

  beforeEach(() => {
    socket = createFakeSocket({ data: { userId: USER_A, ip: '10.0.0.1', device: 'jest' } });
    messages = { send: jest.fn(), markDelivered: jest.fn(), markRead: jest.fn() };
    registerMessageHandlers(socket.asSocket(), { messages });
  });

  it('registra message:send, message:delivered e message:read', () => {
    expect([...socket.handlers.keys()]).toEqual([
      'message:send',
      'message:delivered',
      'message:read',
    ]);
  });

  it('message:send envia com os metadados do handshake e devolve a MessageDTO no ack', async () => {
    const dto = { id: MESSAGE_ID };
    messages.send.mockResolvedValue(dto);

    const response = await emit(socket, 'message:send', {
      conversationId: CONVERSATION_ID,
      text: '  oi  ',
      clientMessageId: CLIENT_MESSAGE_ID,
    });

    expect(messages.send).toHaveBeenCalledWith(
      USER_A,
      CONVERSATION_ID,
      { text: 'oi', clientMessageId: CLIENT_MESSAGE_ID },
      { ip: '10.0.0.1', device: 'jest' }
    );
    expect(response).toEqual({ ok: true, data: dto });
    expect(socket.broadcasts).toEqual([]);
  });

  it('message:send com payload inválido responde 400 sem chamar o service', async () => {
    const response = await emit(socket, 'message:send', { conversationId: 'x', text: '' });

    expect(messages.send).not.toHaveBeenCalled();
    expect(response).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'VALIDATION_ERROR', statusCode: 400 }),
    });
  });

  it('message:send mapeia o AppError do service (ex.: 403 bloqueio) no ack', async () => {
    messages.send.mockRejectedValue(
      new AppError('Bloqueado', HttpStatus.FORBIDDEN, ErrorCode.USER_BLOCKED)
    );

    const response = await emit(socket, 'message:send', {
      conversationId: CONVERSATION_ID,
      text: 'oi',
    });

    expect(response).toEqual({
      ok: false,
      error: { code: 'USER_BLOCKED', message: 'Bloqueado', statusCode: 403 },
    });
  });

  it('message:delivered confirma a entrega e responde { ok: true, data: null }', async () => {
    messages.markDelivered.mockResolvedValue(undefined);

    const response = await emit(socket, 'message:delivered', {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });

    expect(messages.markDelivered).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, MESSAGE_ID);
    expect(response).toEqual({ ok: true, data: null });
  });

  it('message:read marca como lido e responde { ok: true, data: null }', async () => {
    messages.markRead.mockResolvedValue(undefined);

    const response = await emit(socket, 'message:read', {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });

    expect(messages.markRead).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, MESSAGE_ID);
    expect(response).toEqual({ ok: true, data: null });
  });

  it('message:delivered/read com messageId inválido respondem 400', async () => {
    const delivered = await emit(socket, 'message:delivered', {
      conversationId: CONVERSATION_ID,
      messageId: 'x',
    });
    const read = await emit(socket, 'message:read', { conversationId: CONVERSATION_ID });

    expect(delivered).toEqual(expect.objectContaining({ ok: false }));
    expect(read).toEqual(expect.objectContaining({ ok: false }));
    expect(messages.markDelivered).not.toHaveBeenCalled();
    expect(messages.markRead).not.toHaveBeenCalled();
  });
});
