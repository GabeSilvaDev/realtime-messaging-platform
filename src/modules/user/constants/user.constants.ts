export const USER_CONSTANTS = {
  MIN_USERNAME_LENGTH: 3,
  MAX_USERNAME_LENGTH: 50,
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 100,
  MAX_EMAIL_LENGTH: 255,
  MIN_DISPLAY_NAME_LENGTH: 2,
  MAX_DISPLAY_NAME_LENGTH: 100,
  MAX_AVATAR_URL_LENGTH: 500,
  MAX_BIO_LENGTH: 500,
  MAX_SEARCH_LENGTH: 100,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const USER_STATUS = ['online', 'offline', 'away', 'busy'] as const;
export type UserStatusType = (typeof USER_STATUS)[number];

export const USER_ORDER_BY = ['username', 'displayName', 'createdAt', 'lastSeenAt'] as const;
export type UserOrderBy = (typeof USER_ORDER_BY)[number];

export const SORT_ORDER = ['ASC', 'DESC'] as const;
export type SortOrder = (typeof SORT_ORDER)[number];
