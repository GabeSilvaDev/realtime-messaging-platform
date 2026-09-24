import { profileRoutes, contactRoutes, blockRoutes, userRoutes } from '@/modules/user/routes';

describe('user/routes index', () => {
  it('deve exportar profileRoutes', () => {
    expect(profileRoutes).toBeDefined();
  });

  it('deve exportar contactRoutes', () => {
    expect(contactRoutes).toBeDefined();
  });

  it('deve exportar blockRoutes', () => {
    expect(blockRoutes).toBeDefined();
  });

  it('deve exportar userRoutes', () => {
    expect(userRoutes).toBeDefined();
  });
});
