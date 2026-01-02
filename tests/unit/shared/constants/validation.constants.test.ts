import {
  VALIDATION_ERROR_MESSAGES,
  DEFAULT_VALIDATION_ERROR_MESSAGE,
  DEFAULT_FIELD_NAME,
} from '@/shared/constants/validation.constants';

describe('Validation Constants', () => {
  describe('VALIDATION_ERROR_MESSAGES', () => {
    it('should have message for invalid_type', () => {
      expect(VALIDATION_ERROR_MESSAGES['invalid_type']).toBe('Tipo inválido');
    });

    it('should have message for too_small', () => {
      expect(VALIDATION_ERROR_MESSAGES['too_small']).toBe('Valor muito pequeno');
    });

    it('should have message for too_big', () => {
      expect(VALIDATION_ERROR_MESSAGES['too_big']).toBe('Valor muito grande');
    });

    it('should have message for invalid_format', () => {
      expect(VALIDATION_ERROR_MESSAGES['invalid_format']).toBe('Formato inválido');
    });
  });

  describe('DEFAULT_VALIDATION_ERROR_MESSAGE', () => {
    it('should be "Erro de validação"', () => {
      expect(DEFAULT_VALIDATION_ERROR_MESSAGE).toBe('Erro de validação');
    });
  });

  describe('DEFAULT_FIELD_NAME', () => {
    it('should be "value"', () => {
      expect(DEFAULT_FIELD_NAME).toBe('value');
    });
  });
});
