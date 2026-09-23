import { ProfileController, profileController } from '@/modules/user/controllers';

describe('user/controllers index', () => {
  it('deve exportar ProfileController', () => {
    expect(ProfileController).toBeDefined();
    expect(typeof ProfileController).toBe('function');
  });

  it('deve exportar profileController instance', () => {
    expect(profileController).toBeDefined();
    expect(profileController).toBeInstanceOf(ProfileController);
  });
});
