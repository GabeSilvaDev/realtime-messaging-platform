import { z } from 'zod';

export const addContactSchema = z.object({
  contactId: z.uuid({ message: 'ID de contato inválido' }),
  nickname: z
    .string()
    .min(1, 'Apelido deve ter no mínimo 1 caractere')
    .max(100, 'Apelido deve ter no máximo 100 caracteres')
    .optional(),
});

export const updateContactSchema = z.object({
  nickname: z
    .string()
    .min(1, 'Apelido deve ter no mínimo 1 caractere')
    .max(100, 'Apelido deve ter no máximo 100 caracteres')
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
  search: z.string().max(100, 'Termo de busca deve ter no máximo 100 caracteres').optional(),
  isBlocked: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  isFavorite: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  orderBy: z.enum(['nickname', 'createdAt', 'lastInteraction']).optional().default('createdAt'),
  order: z.enum(['ASC', 'DESC']).optional().default('DESC'),
});

export const searchUsersForContactSchema = z.object({
  query: z
    .string()
    .min(1, 'Termo de busca é obrigatório')
    .max(100, 'Termo de busca deve ter no máximo 100 caracteres'),
  limit: z.coerce.number().min(1).max(50).optional().default(20),
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
