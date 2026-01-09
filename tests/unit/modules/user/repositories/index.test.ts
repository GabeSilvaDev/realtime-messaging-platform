import * as repositoriesIndex from '@/modules/user/repositories';

describe('repositories index', () => {
  describe('exports', () => {
    it('deve exportar UserRepository class', () => {
      expect(repositoriesIndex.UserRepository).toBeDefined();
    });

    it('deve exportar userRepository singleton', () => {
      expect(repositoriesIndex.userRepository).toBeDefined();
      expect(repositoriesIndex.userRepository).toBeInstanceOf(repositoriesIndex.UserRepository);
    });

    it('deve exportar ContactRepository class', () => {
      expect(repositoriesIndex.ContactRepository).toBeDefined();
    });

    it('deve exportar contactRepository singleton', () => {
      expect(repositoriesIndex.contactRepository).toBeDefined();
      expect(repositoriesIndex.contactRepository).toBeInstanceOf(
        repositoriesIndex.ContactRepository
      );
    });
  });
});
