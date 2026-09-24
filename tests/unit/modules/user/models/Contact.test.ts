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
          createdByBlock: false,
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

    it('não deve expor o campo interno createdByBlock no toJSON', () => {
      const mockDate = new Date('2026-01-01T00:00:00.000Z');

      const contact = Contact.build(
        {
          userId: 'user-123',
          contactId: 'user-999',
          nickname: null,
          isBlocked: true,
          isFavorite: false,
          blockedAt: mockDate,
          createdByBlock: true,
        },
        { isNewRecord: false }
      );

      contact.setDataValue('id', 'contact-789');
      contact.setDataValue('createdAt', mockDate);
      contact.setDataValue('updatedAt', mockDate);

      const json = contact.toJSON();

      expect(json).not.toHaveProperty('createdByBlock');
      expect(contact.createdByBlock).toBe(true);
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

  describe('atributos', () => {
    it('deve declarar created_by_block como NOT NULL com default false', () => {
      const attribute = Contact.getAttributes().createdByBlock;

      expect(attribute.allowNull).toBe(false);
      expect(attribute.defaultValue).toBe(false);
      expect(attribute.field).toBe('created_by_block');
    });

    it('deve declarar last_interaction_at como coluna interna anulável', () => {
      const contact = Contact.build(
        { userId: 'user-123', contactId: 'user-456' },
        { isNewRecord: false }
      );
      contact.setDataValue('lastInteractionAt', new Date('2026-09-24T00:00:00.000Z'));

      expect(Contact.getAttributes().lastInteractionAt.field).toBe('last_interaction_at');
      expect(Contact.getAttributes().lastInteractionAt.allowNull).toBe(true);
      expect(contact.toJSON()).not.toHaveProperty('lastInteractionAt');
    });
  });
});
