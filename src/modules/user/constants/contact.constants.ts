export const CONTACT_CONSTANTS = {
  MAX_NICKNAME_LENGTH: 100,
  MIN_NICKNAME_LENGTH: 1,
  MAX_SEARCH_LENGTH: 100,
  MIN_SEARCH_LENGTH: 1,
  DEFAULT_LIMIT: 20,
  DEFAULT_SEARCH_LIMIT: 20,
  MAX_LIMIT: 100,
  MAX_SEARCH_LIMIT: 50,
} as const;

/** `presence` ordena a página já carregada (online/away/busy primeiro, depois offline). */
export const CONTACT_ORDER_BY = ['nickname', 'createdAt', 'lastInteraction', 'presence'] as const;
export type ContactOrderBy = (typeof CONTACT_ORDER_BY)[number];
