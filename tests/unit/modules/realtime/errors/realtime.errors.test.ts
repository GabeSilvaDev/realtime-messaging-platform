import { TypingNotAllowedException } from '@/modules/realtime/errors';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

describe('realtime errors', () => {
  it('TypingNotAllowedException é 400 BAD_REQUEST com mensagem padrão', () => {
    const error = new TypingNotAllowedException();

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(error.code).toBe(ErrorCode.BAD_REQUEST);
    expect(error.message).toBe('Indicador de digitação disponível apenas em conversas 1:1');
  });

  it('aceita mensagem personalizada', () => {
    expect(new TypingNotAllowedException('x').message).toBe('x');
  });
});
