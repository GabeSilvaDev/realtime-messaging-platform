import {
  CLIENT_EVENTS,
  REALTIME_CONSTANTS,
  ROOM_PREFIXES,
  SERVER_EVENTS,
  SOCKET_ERRORS,
  conversationRoom,
  userRoom,
} from '@/modules/realtime/constants';

describe('realtime constants', () => {
  it('deve definir o TTL de digitação (3s) e o limite do device', () => {
    expect(REALTIME_CONSTANTS).toEqual({ TYPING_TTL_MS: 3000, MAX_DEVICE_LENGTH: 255 });
  });

  it('deve nomear as rooms por usuário e por conversa', () => {
    expect(ROOM_PREFIXES).toEqual({ USER: 'user:', CONVERSATION: 'conversation:' });
    expect(userRoom('u1')).toBe('user:u1');
    expect(conversationRoom('c1')).toBe('conversation:c1');
  });

  it('deve listar os eventos cliente → servidor', () => {
    expect(CLIENT_EVENTS).toEqual({
      MESSAGE_SEND: 'message:send',
      MESSAGE_DELIVERED: 'message:delivered',
      MESSAGE_READ: 'message:read',
      TYPING_START: 'typing:start',
      TYPING_STOP: 'typing:stop',
      PRESENCE_SET: 'presence:set',
    });
  });

  it('deve listar os eventos servidor → cliente', () => {
    expect(SERVER_EVENTS).toEqual({
      MESSAGE_NEW: 'message:new',
      MESSAGE_DELETED: 'message:deleted',
      MESSAGE_STATUS: 'message:status',
      TYPING_INDICATOR: 'typing:indicator',
      CONVERSATION_NEW: 'conversation:new',
      CONVERSATION_UPDATED: 'conversation:updated',
      CONVERSATION_DELETED: 'conversation:deleted',
      PRESENCE_UPDATE: 'presence:update',
      PRESENCE_SNAPSHOT: 'presence:snapshot',
    });
  });

  it('deve definir as mensagens de erro do handshake (connect_error)', () => {
    expect(SOCKET_ERRORS).toEqual({
      UNAUTHORIZED: 'UNAUTHORIZED',
      INTERNAL_ERROR: 'INTERNAL_ERROR',
    });
  });
});
