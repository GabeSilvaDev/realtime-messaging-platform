import { z } from 'zod';
import { MANUAL_PRESENCE_STATUSES, PRESENCE_CONSTANTS } from '../constants';

/** `PUT /api/presence/status` e `presence:set`. */
export const presenceStatusSchema = z.object({
  status: z.enum(MANUAL_PRESENCE_STATUSES, {
    message: 'Status inválido. Use: available, away ou busy',
  }),
});

/** `GET /api/presence?userIds=<uuid>,<uuid>` (1 a 100 ids). */
export const presenceQuerySchema = z.object({
  userIds: z
    .string({ message: 'userIds é obrigatório' })
    .transform((value) => value.split(',').map((id) => id.trim()))
    .pipe(
      z
        .array(z.uuid({ message: 'ID de usuário inválido' }))
        .min(1, 'Pelo menos um ID é obrigatório')
        .max(
          PRESENCE_CONSTANTS.MAX_QUERY_USER_IDS,
          `Máximo de ${String(PRESENCE_CONSTANTS.MAX_QUERY_USER_IDS)} usuários por consulta`
        )
    ),
});

export type PresenceStatusInput = z.infer<typeof presenceStatusSchema>;
export type PresenceQueryInput = z.infer<typeof presenceQuerySchema>;
