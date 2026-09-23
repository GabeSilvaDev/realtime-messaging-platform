import {
  PROFILE_CONSTANTS,
  AVATAR_CONSTANTS,
  STATUS_VALUES,
  THEME_VALUES,
  ALLOW_MESSAGES_VALUES,
  USER_CONSTANTS,
  USER_STATUS,
  USER_ORDER_BY,
  SORT_ORDER,
  CONTACT_CONSTANTS,
  CONTACT_ORDER_BY,
} from '@/modules/user/constants';

describe('user/constants index', () => {
  it('deve exportar constantes de profile', () => {
    expect(PROFILE_CONSTANTS).toBeDefined();
    expect(AVATAR_CONSTANTS).toBeDefined();
    expect(STATUS_VALUES).toBeDefined();
    expect(THEME_VALUES).toBeDefined();
    expect(ALLOW_MESSAGES_VALUES).toBeDefined();
  });

  it('deve exportar constantes de user', () => {
    expect(USER_CONSTANTS).toBeDefined();
    expect(USER_STATUS).toBeDefined();
    expect(USER_ORDER_BY).toBeDefined();
    expect(SORT_ORDER).toBeDefined();
  });

  it('deve exportar constantes de contact', () => {
    expect(CONTACT_CONSTANTS).toBeDefined();
    expect(CONTACT_ORDER_BY).toBeDefined();
  });
});
