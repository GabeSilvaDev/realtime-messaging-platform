import type { z } from 'zod';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { logger } from '@/shared/logger';
import type { AckCallback, AckError } from '../types';

/** Contexto dos logs de um evento recebido. */
export interface AckContext {
  event: string;
  userId: string;
}

/** Listener de um evento cliente → servidor: payload e ack chegam como `unknown`. */
export type AckListener = (payload: unknown, ack?: unknown) => void;

/** A partir deste status a falha é do servidor (sempre logada como `error`). */
const SERVER_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

const INTERNAL_ERROR: AckError = {
  code: ErrorCode.INTERNAL_ERROR,
  message: 'Erro interno do servidor',
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** `AppError` vira `{ code, message, statusCode }`; qualquer outro erro vira INTERNAL_ERROR 500. */
export function toAckError(error: unknown): AckError {
  if (AppError.isAppError(error)) {
    return { code: error.code, message: error.message, statusCode: error.statusCode };
  }
  return INTERNAL_ERROR;
}

function validationError(issues: z.core.$ZodIssue[]): AckError {
  return {
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Dados inválidos',
    statusCode: HttpStatus.BAD_REQUEST,
    details: issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
  };
}

/**
 * Cria o listener de um evento com ack: valida o payload com `schema`, executa `run` e responde
 * `{ ok: true, data }` ou `{ ok: false, error }` (mesmos códigos da API REST).
 *
 * Sem ack (ou com um ack que não é função), o evento é processado do mesmo jeito e a falha só é
 * logada: recusas (validação, `AppError` 4xx) como `warn`; erros inesperados/5xx sempre como
 * `error`, com ou sem ack.
 */
export function withAck<S extends z.ZodType>(
  context: AckContext,
  schema: S,
  run: (payload: z.output<S>) => Promise<unknown>
): AckListener {
  return (payload, ack) => {
    const reply = typeof ack === 'function' ? (ack as AckCallback<unknown>) : null;

    const fail = (error: AckError, cause?: unknown): void => {
      if (error.statusCode >= SERVER_ERROR_STATUS) {
        logger.error(
          `Falha ao processar ${context.event}`,
          cause instanceof Error ? cause : new Error(String(cause)),
          { ...context }
        );
      } else if (reply === null) {
        logger.warn(`Evento ${context.event} recusado`, { ...context, code: error.code });
      }
      reply?.({ ok: false, error });
    };

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      fail(validationError(parsed.error.issues));
      return;
    }

    run(parsed.data).then(
      (data) => {
        reply?.({ ok: true, data });
      },
      (error: unknown) => {
        fail(toAckError(error), error);
      }
    );
  };
}
