import { z } from 'zod';
import { CONTACT_CONSTANTS, CONTACT_ORDER_BY } from '../constants';

export const addContactSchema = z.object({
  contactId: z.uuid({ message: 'ID de contato inválido' }),
  nickname: z
    .string()
    .min(
      CONTACT_CONSTANTS.MIN_NICKNAME_LENGTH,
      `Apelido deve ter no mínimo ${String(CONTACT_CONSTANTS.MIN_NICKNAME_LENGTH)} caractere`
    )
    .max(
      CONTACT_CONSTANTS.MAX_NICKNAME_LENGTH,
      `Apelido deve ter no máximo ${String(CONTACT_CONSTANTS.MAX_NICKNAME_LENGTH)} caracteres`
    )
    .optional(),
});

export const updateContactSchema = z.object({
  nickname: z
    .string()
    .min(
      CONTACT_CONSTANTS.MIN_NICKNAME_LENGTH,
      `Apelido deve ter no mínimo ${String(CONTACT_CONSTANTS.MIN_NICKNAME_LENGTH)} caractere`
    )
    .max(
      CONTACT_CONSTANTS.MAX_NICKNAME_LENGTH,
      `Apelido deve ter no máximo ${String(CONTACT_CONSTANTS.MAX_NICKNAME_LENGTH)} caracteres`
    )
    .nullable()
    .optional(),
  isFavorite: z.boolean().optional(),
});

export const contactIdParamSchema = z.object({
  contactId: z.uuid({ message: 'ID de contato inválido' }),
});

export const blockUserSchema = z.object({
  userId: z.uuid({ message: 'ID de usuário inválido' }),
});

export const listContactsSchema = z.object({
  search: z
    .string()
    .max(
      CONTACT_CONSTANTS.MAX_SEARCH_LENGTH,
      `Termo de busca deve ter no máximo ${String(CONTACT_CONSTANTS.MAX_SEARCH_LENGTH)} caracteres`
    )
    .optional(),
  isBlocked: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  isFavorite: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  limit: z.coerce
    .number()
    .min(1)
    .max(CONTACT_CONSTANTS.MAX_LIMIT)
    .optional()
    .default(CONTACT_CONSTANTS.DEFAULT_LIMIT),
  offset: z.coerce.number().min(0).optional().default(0),
  orderBy: z.enum(CONTACT_ORDER_BY).optional().default('createdAt'),
  order: z.enum(['ASC', 'DESC']).optional().default('DESC'),
});

export const searchUsersForContactSchema = z.object({
  query: z
    .string()
    .min(CONTACT_CONSTANTS.MIN_SEARCH_LENGTH, 'Termo de busca é obrigatório')
    .max(
      CONTACT_CONSTANTS.MAX_SEARCH_LENGTH,
      `Termo de busca deve ter no máximo ${String(CONTACT_CONSTANTS.MAX_SEARCH_LENGTH)} caracteres`
    ),
  limit: z.coerce
    .number()
    .min(1)
    .max(CONTACT_CONSTANTS.MAX_SEARCH_LIMIT)
    .optional()
    .default(CONTACT_CONSTANTS.DEFAULT_SEARCH_LIMIT),
  excludeBlocked: z
    .string()
    .transform((val) => val !== 'false')
    .optional(),
});

export type AddContactInput = z.infer<typeof addContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ContactIdParam = z.infer<typeof contactIdParamSchema>;
export type BlockUserInput = z.infer<typeof blockUserSchema>;
export type ListContactsQuery = z.infer<typeof listContactsSchema>;
export type SearchUsersForContactQuery = z.infer<typeof searchUsersForContactSchema>;
