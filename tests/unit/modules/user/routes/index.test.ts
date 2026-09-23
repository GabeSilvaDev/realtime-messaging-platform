import { profileRoutes } from '@/modules/user/routes';

describe('user/routes index', () => {
  it('deve exportar profileRoutes', () => {
    expect(profileRoutes).toBeDefined();
  });
});
