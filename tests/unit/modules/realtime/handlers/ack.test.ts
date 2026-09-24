jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { z } from 'zod';
import { toAckError, withAck } from '@/modules/realtime/handlers/ack';
import type { AckResponse } from '@/modules/realtime/types';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { logger } from '@/shared/logger';

const mockLogger = logger as jest.Mocked<typeof logger>;
const CONTEXT = { event: 'test:event', userId: '11111111-1111-4111-8111-111111111111' };
const schema = z.object({ value: z.string().min(1) });

function call(
  listener: (payload: unknown, ack?: unknown) => void,
  payload: unknown
): Promise<AckResponse<unknown>> {
  return new Promise((resolve) => {
    listener(payload, resolve);
  });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('ack', () => {
  describe('toAckError', () => {
    it('mapeia AppError para { code, message, statusCode }', () => {
      const error = new AppError(
        'Conversa não encontrada',
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND
      );

      expect(toAckError(error)).toEqual({
        code: 'NOT_FOUND',
        message: 'Conversa não encontrada',
        statusCode: 404,
      });
    });

    it('erro inesperado vira INTERNAL_ERROR 500 sem vazar a mensagem', () => {
      expect(toAckError(new Error('segredo do banco'))).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor',
        statusCode: 500,
      });
      expect(toAckError('x')).toEqual(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
    });
  });

  describe('withAck', () => {
    it('payload válido: executa com os dados parseados e responde { ok: true, data }', async () => {
      const run = jest.fn().mockResolvedValue({ id: 1 });

      const response = await call(withAck(CONTEXT, schema, run), { value: 'x', extra: true });

      expect(run).toHaveBeenCalledWith({ value: 'x' });
      expect(response).toEqual({ ok: true, data: { id: 1 } });
    });

    it('payload inválido: responde VALIDATION_ERROR 400 com details e não executa', async () => {
      const run = jest.fn();

      const response = await call(withAck(CONTEXT, schema, run), { value: '' });

      expect(run).not.toHaveBeenCalled();
      expect(response).toEqual({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          statusCode: 400,
          details: [{ field: 'value', message: expect.any(String) }],
        },
      });
    });

    it('AppError do service vira { ok: false, error } sem log de erro', async () => {
      const run = jest
        .fn()
        .mockRejectedValue(new AppError('Proibido', HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN));

      const response = await call(withAck(CONTEXT, schema, run), { value: 'x' });

      expect(response).toEqual({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Proibido', statusCode: 403 },
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('erro inesperado responde INTERNAL_ERROR e é logado com o contexto', async () => {
      const failure = new Error('mongo down');
      const run = jest.fn().mockRejectedValue(failure);

      const response = await call(withAck(CONTEXT, schema, run), { value: 'x' });

      expect(response).toEqual({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor', statusCode: 500 },
      });
      expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), failure, CONTEXT);
    });

    it('rejeição que não é Error é envolvida antes de logar', async () => {
      const run = jest.fn().mockRejectedValue('falhou');

      await call(withAck(CONTEXT, schema, run), { value: 'x' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: 'falhou' }),
        CONTEXT
      );
    });

    describe('sem ack (ou ack que não é função)', () => {
      it('executa normalmente', async () => {
        const run = jest.fn().mockResolvedValue(null);

        withAck(CONTEXT, schema, run)({ value: 'x' });
        withAck(CONTEXT, schema, run)({ value: 'y' }, 'não é função');
        await flush();

        expect(run).toHaveBeenCalledTimes(2);
      });

      it('recusas (validação ou AppError) só são logadas como warn', async () => {
        const run = jest
          .fn()
          .mockRejectedValue(new AppError('Proibido', HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN));

        withAck(CONTEXT, schema, run)({ value: '' });
        withAck(CONTEXT, schema, run)({ value: 'x' });
        await flush();

        expect(mockLogger.warn).toHaveBeenNthCalledWith(1, expect.any(String), {
          ...CONTEXT,
          code: 'VALIDATION_ERROR',
        });
        expect(mockLogger.warn).toHaveBeenNthCalledWith(2, expect.any(String), {
          ...CONTEXT,
          code: 'FORBIDDEN',
        });
      });

      it('erro inesperado continua sendo logado como error', async () => {
        const run = jest.fn().mockRejectedValue(new Error('mongo down'));

        withAck(CONTEXT, schema, run)({ value: 'x' });
        await flush();

        expect(mockLogger.error).toHaveBeenCalledTimes(1);
      });
    });
  });
});
