import * as validationIndex from '@/modules/user/validation';

describe('validation index', () => {
  describe('user schemas exports', () => {
    it('deve exportar createUserSchema', () => {
      expect(validationIndex.createUserSchema).toBeDefined();
    });

    it('deve exportar searchUsersSchema', () => {
      expect(validationIndex.searchUsersSchema).toBeDefined();
    });

    it('deve exportar updateAvatarSchema', () => {
      expect(validationIndex.updateAvatarSchema).toBeDefined();
    });

    it('deve exportar updateProfileSchema', () => {
      expect(validationIndex.updateProfileSchema).toBeDefined();
    });

    it('deve exportar updateStatusSchema', () => {
      expect(validationIndex.updateStatusSchema).toBeDefined();
    });

    it('deve exportar updateUserSchema', () => {
      expect(validationIndex.updateUserSchema).toBeDefined();
    });

    it('deve exportar userIdParamSchema', () => {
      expect(validationIndex.userIdParamSchema).toBeDefined();
    });
  });

  describe('contact schemas exports', () => {
    it('deve exportar addContactSchema', () => {
      expect(validationIndex.addContactSchema).toBeDefined();
    });

    it('deve exportar updateContactSchema', () => {
      expect(validationIndex.updateContactSchema).toBeDefined();
    });

    it('deve exportar contactIdParamSchema', () => {
      expect(validationIndex.contactIdParamSchema).toBeDefined();
    });

    it('deve exportar blockUserSchema', () => {
      expect(validationIndex.blockUserSchema).toBeDefined();
    });

    it('deve exportar listContactsSchema', () => {
      expect(validationIndex.listContactsSchema).toBeDefined();
    });

    it('deve exportar searchUsersForContactSchema', () => {
      expect(validationIndex.searchUsersForContactSchema).toBeDefined();
    });
  });
});
