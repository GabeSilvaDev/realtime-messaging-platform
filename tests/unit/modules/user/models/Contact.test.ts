import Contact from '@/modules/user/models/Contact';

describe('Contact Model', () => {
  describe('toJSON', () => {
    it('deve retornar ContactAttributes corretamente', () => {
      const mockDate = new Date('2026-01-01T00:00:00.000Z');

      const contact = Contact.build(
        {
          userId: 'user-123',
          contactId: 'user-456',
          nickname: 'Meu Amigo',
          isBlocked: false,
          isFavorite: true,
          blockedAt: null,
        },
        { isNewRecord: false }
      );

      contact.setDataValue('id', 'contact-123');
      contact.setDataValue('createdAt', mockDate);
      contact.setDataValue('updatedAt', mockDate);

      const json = contact.toJSON();

      expect(json).toEqual({
        id: 'contact-123',
        userId: 'user-123',
        contactId: 'user-456',
        nickname: 'Meu Amigo',
        isBlocked: false,
        isFavorite: true,
        blockedAt: null,
        createdAt: mockDate,
        updatedAt: mockDate,
      });
    });

    it('deve retornar ContactAttributes com isBlocked true e blockedAt preenchido', () => {
      const mockDate = new Date('2026-01-01T00:00:00.000Z');
      const blockedDate = new Date('2026-01-02T00:00:00.000Z');

      const contact = Contact.build(
        {
          userId: 'user-123',
          contactId: 'user-789',
          nickname: null,
          isBlocked: true,
          isFavorite: false,
          blockedAt: blockedDate,
        },
        { isNewRecord: false }
      );

      contact.setDataValue('id', 'contact-456');
      contact.setDataValue('createdAt', mockDate);
      contact.setDataValue('updatedAt', mockDate);

      const json = contact.toJSON();

      expect(json.isBlocked).toBe(true);
      expect(json.blockedAt).toEqual(blockedDate);
      expect(json.nickname).toBeNull();
    });
  });
});
