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

  describe('profile schemas exports', () => {
    it('deve exportar updateProfileDataSchema', () => {
      expect(validationIndex.updateProfileDataSchema).toBeDefined();
    });

    it('deve exportar updateDisplayNameSchema', () => {
      expect(validationIndex.updateDisplayNameSchema).toBeDefined();
    });

    it('deve exportar updateBioSchema', () => {
      expect(validationIndex.updateBioSchema).toBeDefined();
    });

    it('deve exportar updatePresenceStatusSchema', () => {
      expect(validationIndex.updatePresenceStatusSchema).toBeDefined();
    });

    it('deve exportar avatarFileSchema', () => {
      expect(validationIndex.avatarFileSchema).toBeDefined();
    });

    it('deve exportar uploadAvatarSchema', () => {
      expect(validationIndex.uploadAvatarSchema).toBeDefined();
    });

    it('deve exportar avatarProcessingOptionsSchema', () => {
      expect(validationIndex.avatarProcessingOptionsSchema).toBeDefined();
    });

    it('deve exportar avatarCropOptionsSchema', () => {
      expect(validationIndex.avatarCropOptionsSchema).toBeDefined();
    });

    it('deve exportar profileVisibilitySchema', () => {
      expect(validationIndex.profileVisibilitySchema).toBeDefined();
    });

    it('deve exportar notificationSettingsSchema', () => {
      expect(validationIndex.notificationSettingsSchema).toBeDefined();
    });

    it('deve exportar updateProfileSettingsSchema', () => {
      expect(validationIndex.updateProfileSettingsSchema).toBeDefined();
    });

    it('deve exportar updatePresenceSchema', () => {
      expect(validationIndex.updatePresenceSchema).toBeDefined();
    });

    it('deve exportar bulkPresenceQuerySchema', () => {
      expect(validationIndex.bulkPresenceQuerySchema).toBeDefined();
    });

    it('deve exportar profileIdParamSchema', () => {
      expect(validationIndex.profileIdParamSchema).toBeDefined();
    });
  });
});
