export const PROFILE_CONSTANTS = {
  MAX_BIO_LENGTH: 500,
  MAX_DISPLAY_NAME_LENGTH: 100,
  MIN_DISPLAY_NAME_LENGTH: 2,
  MAX_AVATAR_URL_LENGTH: 500,
} as const;

export const AVATAR_CONSTANTS = {
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const,
  ALLOWED_FORMATS: ['webp', 'jpeg', 'png'] as const,
  SIZE_NAMES: ['original', 'large', 'medium', 'small', 'thumbnail'] as const,
  DEFAULT_QUALITY: 85,
  DEFAULT_FORMAT: 'webp' as const,
} as const;

export const STATUS_VALUES = ['online', 'offline', 'away', 'busy'] as const;
export type StatusValue = (typeof STATUS_VALUES)[number];

export const THEME_VALUES = ['light', 'dark', 'system'] as const;
export type ThemeValue = (typeof THEME_VALUES)[number];

export const ALLOW_MESSAGES_VALUES = ['everyone', 'contacts', 'none'] as const;
export type AllowMessagesValue = (typeof ALLOW_MESSAGES_VALUES)[number];
