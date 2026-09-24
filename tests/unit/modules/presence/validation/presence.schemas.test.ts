import { presenceQuerySchema, presenceStatusSchema } from '@/modules/presence/validation';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

describe('presence schemas', () => {
  describe('presenceStatusSchema', () => {
    it.each(['available', 'away', 'busy'])('aceita %s', (status) => {
      expect(presenceStatusSchema.parse({ status })).toEqual({ status });
    });

    it.each(['online', 'offline', '', undefined])('recusa %p', (status) => {
      const result = presenceStatusSchema.safeParse({ status });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        'Status inválido. Use: available, away ou busy'
      );
    });
  });

  describe('presenceQuerySchema', () => {
    it('separa por vírgula e apara espaços', () => {
      expect(presenceQuerySchema.parse({ userIds: `${ANA}, ${BOB}` })).toEqual({
        userIds: [ANA, BOB],
      });
    });

    it('exige o parâmetro', () => {
      const result = presenceQuerySchema.safeParse({});

      expect(result.error?.issues[0]?.message).toBe('userIds é obrigatório');
    });

    it('recusa id que não é UUID', () => {
      const result = presenceQuerySchema.safeParse({ userIds: `${ANA},x` });

      expect(result.error?.issues[0]?.message).toBe('ID de usuário inválido');
    });

    it('aceita até 100 ids e recusa 101', () => {
      const ids = (count: number): string => Array.from({ length: count }, () => ANA).join(',');

      expect(presenceQuerySchema.safeParse({ userIds: ids(100) }).success).toBe(true);
      expect(presenceQuerySchema.safeParse({ userIds: ids(101) }).error?.issues[0]?.message).toBe(
        'Máximo de 100 usuários por consulta'
      );
    });
  });
});
