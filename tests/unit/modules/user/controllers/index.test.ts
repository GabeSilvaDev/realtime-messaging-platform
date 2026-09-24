import {
  ProfileController,
  profileController,
  ContactController,
  contactController,
  BlockController,
  blockController,
  UserController,
  userController,
} from '@/modules/user/controllers';

describe('user/controllers index', () => {
  it('deve exportar ProfileController', () => {
    expect(ProfileController).toBeDefined();
    expect(typeof ProfileController).toBe('function');
  });

  it('deve exportar profileController instance', () => {
    expect(profileController).toBeDefined();
    expect(profileController).toBeInstanceOf(ProfileController);
  });

  it('deve exportar ContactController e contactController instance', () => {
    expect(ContactController).toBeDefined();
    expect(contactController).toBeInstanceOf(ContactController);
  });

  it('deve exportar BlockController e blockController instance', () => {
    expect(BlockController).toBeDefined();
    expect(blockController).toBeInstanceOf(BlockController);
  });

  it('deve exportar UserController e userController instance', () => {
    expect(UserController).toBeDefined();
    expect(userController).toBeInstanceOf(UserController);
  });
});
