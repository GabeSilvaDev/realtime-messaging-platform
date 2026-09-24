import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

/** O Elasticsearch não respondeu (ou recusou a consulta): só a busca fica indisponível. */
export class SearchUnavailableException extends AppError {
  constructor(message = 'Busca indisponível no momento; tente novamente mais tarde') {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.SEARCH_UNAVAILABLE);
  }
}

/** `from` posterior a `to`. */
export class InvalidSearchRangeException extends AppError {
  constructor(message = 'Período inválido: "from" deve ser anterior ou igual a "to"') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}
