import { z } from 'zod';
import { SEARCH_CONSTANTS } from '../constants';

/** UUID normalizado em minúsculas (como os ids gravados no índice). */
const uuid = (message: string): z.ZodPipe<z.ZodUUID, z.ZodTransform<string, string>> =>
  z.uuid({ message }).transform((value) => value.toLowerCase());

/** Data ISO 8601 com fuso (`Z` ou `±hh:mm`), convertida em `Date`. */
const isoDateTime = (field: string): z.ZodPipe<z.ZodISODateTime, z.ZodTransform<Date, string>> =>
  z.iso
    .datetime({
      offset: true,
      message: `${field} deve ser uma data ISO 8601 com fuso (ex.: 2026-09-27T10:00:00Z)`,
    })
    .transform((value) => new Date(value));

const limitMessage = `limit deve estar entre 1 e ${String(SEARCH_CONSTANTS.MAX_LIMIT)}`;

/** `GET /api/search/messages` (a regra `from ≤ to` fica no service). */
export const searchMessagesQuerySchema = z.object({
  q: z
    .string({ message: 'q é obrigatório' })
    .trim()
    .min(1, 'q não pode estar vazio')
    .max(
      SEARCH_CONSTANTS.MAX_QUERY_LENGTH,
      `q deve ter no máximo ${String(SEARCH_CONSTANTS.MAX_QUERY_LENGTH)} caracteres`
    ),
  conversationId: uuid('ID de conversa inválido').optional(),
  senderId: uuid('ID de usuário inválido').optional(),
  from: isoDateTime('from').optional(),
  to: isoDateTime('to').optional(),
  limit: z.coerce
    .number({ message: 'limit deve ser um número inteiro' })
    .int('limit deve ser um número inteiro')
    .min(1, limitMessage)
    .max(SEARCH_CONSTANTS.MAX_LIMIT, limitMessage)
    .optional()
    .default(SEARCH_CONSTANTS.DEFAULT_LIMIT),
});

export type SearchMessagesQuery = z.infer<typeof searchMessagesQuerySchema>;
