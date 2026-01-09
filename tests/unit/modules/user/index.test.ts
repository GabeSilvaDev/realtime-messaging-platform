import * as userModuleIndex from '@/modules/user';
import * as typesIndex from '@/modules/user/types';

describe('user module index', () => {
  describe('module exports', () => {
    it('deve exportar Contact model', () => {
      expect(userModuleIndex.Contact).toBeDefined();
    });

    it('deve exportar services', () => {
      expect(userModuleIndex.ContactService).toBeDefined();
      expect(userModuleIndex.contactService).toBeDefined();
      expect(userModuleIndex.ProfileService).toBeDefined();
      expect(userModuleIndex.profileService).toBeDefined();
      expect(userModuleIndex.UserService).toBeDefined();
      expect(userModuleIndex.userService).toBeDefined();
    });

    it('deve exportar exceptions de services', () => {
      expect(userModuleIndex.CannotAddSelfException).toBeDefined();
      expect(userModuleIndex.CannotBlockSelfException).toBeDefined();
      expect(userModuleIndex.CannotDeleteSelfException).toBeDefined();
      expect(userModuleIndex.ContactAlreadyExistsException).toBeDefined();
      expect(userModuleIndex.ContactNotFoundException).toBeDefined();
      expect(userModuleIndex.EmailAlreadyExistsException).toBeDefined();
      expect(userModuleIndex.InvalidAvatarUrlException).toBeDefined();
      expect(userModuleIndex.ProfileNotFoundException).toBeDefined();
      expect(userModuleIndex.UserBlockedException).toBeDefined();
      expect(userModuleIndex.UsernameAlreadyExistsException).toBeDefined();
      expect(userModuleIndex.UserNotFoundException).toBeDefined();
    });

    it('deve exportar repositories', () => {
      expect(userModuleIndex.ContactRepository).toBeDefined();
      expect(userModuleIndex.contactRepository).toBeDefined();
      expect(userModuleIndex.UserRepository).toBeDefined();
      expect(userModuleIndex.userRepository).toBeDefined();
    });
  });

  describe('types index exports', () => {
    it('deve re-exportar tipos de user.types', () => {
      expect(typesIndex.UserStatus).toBeDefined();
    });

    it('deve re-exportar tipos via barrel export', () => {
      const exports = Object.keys(typesIndex);
      expect(exports.length).toBeGreaterThan(0);
    });
  });
});
