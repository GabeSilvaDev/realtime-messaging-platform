import { InvalidSearchRangeException, SearchUnavailableException } from '@/modules/search/errors';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

describe('search errors', () => {
  it.each([
    [
      new SearchUnavailableException(),
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.SEARCH_UNAVAILABLE,
      'Busca indisponível no momento; tente novamente mais tarde',
    ],
    [
      new InvalidSearchRangeException(),
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Período inválido: "from" deve ser anterior ou igual a "to"',
    ],
  ])('%p', (error, statusCode, code, message) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(statusCode);
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
  });

  it('aceitam mensagem customizada', () => {
    expect(new SearchUnavailableException('fora').message).toBe('fora');
    expect(new InvalidSearchRangeException('inválido').message).toBe('inválido');
  });
});
