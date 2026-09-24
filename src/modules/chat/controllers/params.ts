import type { Request, Response } from 'express';
import { sendValidationError } from '@/shared/http/controller.helpers';
import { conversationIdParamSchema } from '../validation/chat.schemas';

/** Valida `:id` da rota; em caso de erro já responde 400 e retorna `null`. */
export function parseConversationId(req: Request, res: Response): string | null {
  const params = conversationIdParamSchema.safeParse(req.params);
  if (!params.success) {
    sendValidationError(res, params.error.issues);
    return null;
  }
  return params.data.id;
}
