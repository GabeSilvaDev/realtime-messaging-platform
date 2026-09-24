import {
  CHAT_CACHE_KEYS,
  CHAT_CACHE_TTL_SECONDS,
  CHAT_CONSTANTS,
  CONVERSATION_TYPES,
  MESSAGE_CONTENT_TYPES,
  PARTICIPANT_ROLES,
} from '@/modules/chat/constants';

describe('chat constants', () => {
  it('deve definir os limites do chat', () => {
    expect(CHAT_CONSTANTS).toEqual({
      MAX_GROUP_PARTICIPANTS: 256,
      MAX_MESSAGE_LENGTH: 10_000,
      MESSAGE_PAGE_SIZE: 50,
      MIN_CONVERSATION_NAME_LENGTH: 1,
      MAX_CONVERSATION_NAME_LENGTH: 100,
      DEFAULT_CONVERSATION_LIMIT: 20,
      MAX_CONVERSATION_LIMIT: 100,
      MAX_DEVICE_LENGTH: 255,
    });
  });

  it('deve listar tipos de conversa, papéis e tipos de conteúdo', () => {
    expect(CONVERSATION_TYPES).toEqual(['direct', 'group']);
    expect(PARTICIPANT_ROLES).toEqual(['admin', 'member']);
    expect(MESSAGE_CONTENT_TYPES).toEqual(['text']);
  });

  it('deve definir a chave e o TTL do cache de participantes', () => {
    expect(CHAT_CACHE_KEYS.participants('c1')).toBe('conv:participants:c1');
    expect(CHAT_CACHE_TTL_SECONDS).toBe(300);
  });
});
