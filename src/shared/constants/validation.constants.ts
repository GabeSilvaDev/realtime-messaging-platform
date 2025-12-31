/**
 * Validation error messages in Portuguese
 */
export const VALIDATION_ERROR_MESSAGES: Record<string, string> = {
  invalid_type: 'Tipo inválido',
  invalid_union: 'União inválida',
  unrecognized_keys: 'Chaves não reconhecidas',
  too_small: 'Valor muito pequeno',
  too_big: 'Valor muito grande',
  custom: 'Erro de validação customizado',
  not_multiple_of: 'Não é múltiplo de',
  invalid_format: 'Formato inválido',
  invalid_key: 'Chave inválida',
  invalid_element: 'Elemento inválido',
  invalid_value: 'Valor inválido',
} as const;

/**
 * Default validation error message when code is not found
 */
export const DEFAULT_VALIDATION_ERROR_MESSAGE = 'Erro de validação';

/**
 * Default field name when path is empty
 */
export const DEFAULT_FIELD_NAME = 'value';
