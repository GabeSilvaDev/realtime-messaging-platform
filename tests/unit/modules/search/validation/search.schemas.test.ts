import { searchMessagesQuerySchema } from '@/modules/search/validation';

const CONVERSATION = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const SENDER = '11111111-1111-4111-8111-111111111111';

function firstMessage(input: Record<string, unknown>): string | undefined {
  return searchMessagesQuerySchema.safeParse(input).error?.issues[0]?.message;
}

describe('searchMessagesQuerySchema', () => {
  it('só q: apara espaços e aplica o limite padrão de 20', () => {
    expect(searchMessagesQuerySchema.parse({ q: '  coração  ' })).toEqual({
      q: 'coração',
      limit: 20,
    });
  });

  it('todos os filtros: UUIDs em minúsculas, datas ISO 8601 viram Date, limit numérico', () => {
    expect(
      searchMessagesQuerySchema.parse({
        q: 'reunião',
        conversationId: CONVERSATION,
        senderId: SENDER,
        from: '2026-09-27T00:00:00Z',
        to: '2026-09-27T12:30:00-03:00',
        limit: '100',
      })
    ).toEqual({
      q: 'reunião',
      conversationId: CONVERSATION.toLowerCase(),
      senderId: SENDER,
      from: new Date('2026-09-27T00:00:00.000Z'),
      to: new Date('2026-09-27T15:30:00.000Z'),
      limit: 100,
    });
  });

  it.each([
    [{}, 'q é obrigatório'],
    [{ q: ['a', 'b'] }, 'q é obrigatório'],
    [{ q: '   ' }, 'q não pode estar vazio'],
    [{ q: 'a'.repeat(201) }, 'q deve ter no máximo 200 caracteres'],
    [{ q: 'a', conversationId: 'x' }, 'ID de conversa inválido'],
    [{ q: 'a', senderId: 'x' }, 'ID de usuário inválido'],
    [
      { q: 'a', from: '2026-09-27' },
      'from deve ser uma data ISO 8601 com fuso (ex.: 2026-09-27T10:00:00Z)',
    ],
    [{ q: 'a', to: 'ontem' }, 'to deve ser uma data ISO 8601 com fuso (ex.: 2026-09-27T10:00:00Z)'],
    [{ q: 'a', limit: '0' }, 'limit deve estar entre 1 e 100'],
    [{ q: 'a', limit: '101' }, 'limit deve estar entre 1 e 100'],
    [{ q: 'a', limit: '2.5' }, 'limit deve ser um número inteiro'],
    [{ q: 'a', limit: 'abc' }, 'limit deve ser um número inteiro'],
  ])('%j → "%s"', (input, message) => {
    expect(firstMessage(input)).toBe(message);
  });

  it('aceita exatamente 200 caracteres e limit 1', () => {
    expect(searchMessagesQuerySchema.parse({ q: 'a'.repeat(200), limit: '1' }).limit).toBe(1);
  });
});
