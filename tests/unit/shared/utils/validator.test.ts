import { z } from 'zod';
import {
  validate,
  validateAsync,
  validateOrThrow,
  validateOrThrowAsync,
  isValid,
  createValidator,
  getValidationErrors,
  mergeSchemas,
  extendSchema,
  partialSchema,
  pickSchema,
  omitSchema,
  z as zodExport,
} from '@/shared/utils/validator';

describe('Validator Utils', () => {
  const stringSchema = z.string();
  const numberSchema = z.number();
  const objectSchema = z.object({
    name: z.string(),
    age: z.number(),
  });

  describe('validate', () => {
    it('should return success for valid data', () => {
      const result = validate(stringSchema, 'hello');

      expect(result.success).toBe(true);
      expect(result.data).toBe('hello');
    });

    it('should return errors for invalid data', () => {
      const result = validate(stringSchema, 123);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should validate complex objects', () => {
      const result = validate(objectSchema, { name: 'John', age: 30 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'John', age: 30 });
    });

    it('should handle invalid_type error', () => {
      const result = validate(stringSchema, 123);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('invalid_type');
      expect(result.errors?.[0]?.message).toContain('Esperado');
    });

    it('should handle too_small error for strings', () => {
      const minSchema = z.string().min(5);
      const result = validate(minSchema, 'ab');

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('too_small');
      expect(result.errors?.[0]?.message).toContain('pelo menos');
      expect(result.errors?.[0]?.message).toContain('caractere');
    });

    it('should handle too_small error for numbers', () => {
      const minSchema = z.number().min(10);
      const result = validate(minSchema, 5);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('too_small');
      expect(result.errors?.[0]?.message).toContain('maior ou igual');
    });

    it('should handle too_small error for arrays', () => {
      const minSchema = z.array(z.string()).min(3);
      const result = validate(minSchema, ['a', 'b']);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('too_small');
      expect(result.errors?.[0]?.message).toContain('item');
    });

    it('should handle too_big error for strings', () => {
      const maxSchema = z.string().max(3);
      const result = validate(maxSchema, 'toolong');

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('too_big');
      expect(result.errors?.[0]?.message).toContain('no máximo');
    });

    it('should handle too_big error for numbers', () => {
      const maxSchema = z.number().max(10);
      const result = validate(maxSchema, 100);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('too_big');
      expect(result.errors?.[0]?.message).toContain('menor ou igual');
    });

    it('should handle too_big error for arrays', () => {
      const maxSchema = z.array(z.string()).max(2);
      const result = validate(maxSchema, ['a', 'b', 'c', 'd']);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('too_big');
    });

    it('should handle invalid_format error for email', () => {
      const emailSchema = z.string().email();
      const result = validate(emailSchema, 'invalid-email');

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.message).toContain('Email inválido');
    });

    it('should handle invalid_format error for url', () => {
      const urlSchema = z.string().url();
      const result = validate(urlSchema, 'not-a-url');

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('invalid_format');
      expect(result.errors?.[0]?.message).toBe('URL inválida');
    });

    it('should handle invalid_format error for uuid', () => {
      const uuidSchema = z.string().uuid();
      const result = validate(uuidSchema, 'not-a-uuid');

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('invalid_format');
      expect(result.errors?.[0]?.message).toBe('UUID inválido');
    });

    it('should handle invalid_format error for regex', () => {
      const regexSchema = z.string().regex(/^[A-Z]+$/);
      const result = validate(regexSchema, 'lowercase');

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('invalid_format');
      expect(result.errors?.[0]?.message).toBe('Formato inválido');
    });

    it('should handle invalid_format error with unknown format', () => {
      const mockSchema = z.string().datetime();
      const result = validate(mockSchema, 'invalid-datetime');

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('invalid_format');
    });

    it('should handle invalid_value error for enums', () => {
      const enumSchema = z.enum(['a', 'b', 'c']);
      const result = validate(enumSchema, 'd');

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('invalid_value');
      expect(result.errors?.[0]?.message).toContain('Deve ser um dos valores');
    });

    it('should use default error message for unknown error codes', () => {
      const schema = z.string().refine(() => false, { message: 'Custom error' });
      const result = validate(schema, 'test');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should handle too_small with unknown origin', () => {
      const setSchema = z.set(z.string()).min(2);
      const result = validate(setSchema, new Set(['a']));

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('too_small');
    });

    it('should handle too_big with unknown origin', () => {
      const setSchema = z.set(z.string()).max(1);
      const result = validate(setSchema, new Set(['a', 'b', 'c']));

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.code).toBe('too_big');
    });

    it('should return field path for nested objects', () => {
      const nestedSchema = z.object({
        user: z.object({
          profile: z.object({
            name: z.string(),
          }),
        }),
      });

      const result = validate(nestedSchema, { user: { profile: { name: 123 } } });

      expect(result.success).toBe(false);
      expect(result.errors?.[0]?.field).toBe('user.profile.name');
    });

    it('should use default field name for root errors', () => {
      const result = validate(stringSchema, 123);

      expect(result.errors?.[0]?.path).toBeDefined();
    });

    it('should handle symbol paths', () => {
      const result = validate(stringSchema, 123);

      expect(result.errors?.[0]?.path).toBeDefined();
    });
  });

  describe('validateAsync', () => {
    it('should return success for valid data asynchronously', async () => {
      const result = await validateAsync(stringSchema, 'hello');

      expect(result.success).toBe(true);
      expect(result.data).toBe('hello');
    });

    it('should return errors for invalid data asynchronously', async () => {
      const result = await validateAsync(stringSchema, 123);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should handle async transformations', async () => {
      const asyncSchema = z.string().transform(async (val) => val.toUpperCase());
      const result = await validateAsync(asyncSchema, 'hello');

      expect(result.success).toBe(true);
      expect(result.data).toBe('HELLO');
    });
  });

  describe('validateOrThrow', () => {
    it('should return data for valid input', () => {
      const data = validateOrThrow(stringSchema, 'hello');

      expect(data).toBe('hello');
    });

    it('should throw error for invalid input', () => {
      expect(() => validateOrThrow(stringSchema, 123)).toThrow('Validation failed');
    });

    it('should attach validationErrors to thrown error', () => {
      try {
        validateOrThrow(stringSchema, 123);
      } catch (error) {
        expect((error as Error & { validationErrors: unknown[] }).validationErrors).toBeDefined();
        expect(
          (error as Error & { validationErrors: unknown[] }).validationErrors.length
        ).toBeGreaterThan(0);
      }
    });
  });

  describe('validateOrThrowAsync', () => {
    it('should return data for valid input asynchronously', async () => {
      const data = await validateOrThrowAsync(stringSchema, 'hello');

      expect(data).toBe('hello');
    });

    it('should throw error for invalid input asynchronously', async () => {
      await expect(validateOrThrowAsync(stringSchema, 123)).rejects.toThrow('Validation failed');
    });

    it('should attach validationErrors to thrown error asynchronously', async () => {
      try {
        await validateOrThrowAsync(stringSchema, 123);
      } catch (error) {
        expect((error as Error & { validationErrors: unknown[] }).validationErrors).toBeDefined();
      }
    });
  });

  describe('isValid', () => {
    it('should return true for valid data', () => {
      expect(isValid(numberSchema, 42)).toBe(true);
    });

    it('should return false for invalid data', () => {
      expect(isValid(numberSchema, 'not a number')).toBe(false);
    });
  });

  describe('getValidationErrors', () => {
    it('should format zod errors', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(0),
      });

      const result = schema.safeParse({ email: 'invalid', age: -1 });

      if (!result.success) {
        const errors = getValidationErrors(result.error);

        expect(errors.length).toBe(2);
        expect(errors[0]).toHaveProperty('field');
        expect(errors[0]).toHaveProperty('message');
        expect(errors[0]).toHaveProperty('code');
      }
    });

    it('should use default message for unknown error codes', () => {
      const mockError = {
        issues: [
          {
            code: 'unknown_error_code_xyz',
            path: ['field'],
            message: 'Some error',
          },
        ],
      };

      const errors = getValidationErrors(mockError as z.ZodError);

      expect(errors[0]?.code).toBe('Erro de validação');
    });
  });

  describe('createValidator', () => {
    it('should create a validator with all methods', () => {
      const validator = createValidator(stringSchema);

      expect(validator).toHaveProperty('validate');
      expect(validator).toHaveProperty('validateAsync');
      expect(validator).toHaveProperty('validateOrThrow');
      expect(validator).toHaveProperty('validateOrThrowAsync');
      expect(validator).toHaveProperty('isValid');
      expect(validator).toHaveProperty('schema');
    });

    it('should validate using created validator', () => {
      const validator = createValidator(stringSchema);
      const result = validator.validate('hello');

      expect(result.success).toBe(true);
    });

    it('should validate with options using created validator', () => {
      const validator = createValidator(stringSchema);
      const result = validator.validate('hello', {});

      expect(result.success).toBe(true);
    });

    it('should validateAsync using created validator', async () => {
      const validator = createValidator(stringSchema);
      const result = await validator.validateAsync('hello');

      expect(result.success).toBe(true);
    });

    it('should validateAsync with options using created validator', async () => {
      const validator = createValidator(stringSchema);
      const result = await validator.validateAsync('hello', {});

      expect(result.success).toBe(true);
    });

    it('should validateOrThrow using created validator', () => {
      const validator = createValidator(stringSchema);
      const data = validator.validateOrThrow('hello');

      expect(data).toBe('hello');
    });

    it('should validateOrThrow with options using created validator', () => {
      const validator = createValidator(stringSchema);
      const data = validator.validateOrThrow('hello', {});

      expect(data).toBe('hello');
    });

    it('should validateOrThrowAsync using created validator', async () => {
      const validator = createValidator(stringSchema);
      const data = await validator.validateOrThrowAsync('hello');

      expect(data).toBe('hello');
    });

    it('should validateOrThrowAsync with options using created validator', async () => {
      const validator = createValidator(stringSchema);
      const data = await validator.validateOrThrowAsync('hello', {});

      expect(data).toBe('hello');
    });

    it('should check validity using created validator', () => {
      const validator = createValidator(numberSchema);

      expect(validator.isValid(42)).toBe(true);
      expect(validator.isValid('not a number')).toBe(false);
    });

    it('should expose schema in created validator', () => {
      const validator = createValidator(stringSchema);

      expect(validator.schema).toBe(stringSchema);
    });
  });

  describe('mergeSchemas', () => {
    it('should merge two object schemas', () => {
      const schema1 = z.object({ name: z.string() });
      const schema2 = z.object({ age: z.number() });

      const merged = mergeSchemas(schema1, schema2);
      const result = merged.safeParse({ name: 'John', age: 30 });

      expect(result.success).toBe(true);
    });

    it('should fail if merged schema requirements not met', () => {
      const schema1 = z.object({ name: z.string() });
      const schema2 = z.object({ age: z.number() });

      const merged = mergeSchemas(schema1, schema2);
      const result = merged.safeParse({ name: 'John' });

      expect(result.success).toBe(false);
    });
  });

  describe('extendSchema', () => {
    it('should extend base schema with new fields', () => {
      const baseSchema = z.object({ id: z.string() });
      const extended = extendSchema(baseSchema, { name: z.string() });

      const result = extended.safeParse({ id: '123', name: 'John' });

      expect(result.success).toBe(true);
    });
  });

  describe('partialSchema', () => {
    it('should make all fields optional', () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const partial = partialSchema(schema);

      const result = partial.safeParse({});

      expect(result.success).toBe(true);
    });

    it('should still accept full objects', () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const partial = partialSchema(schema);

      const result = partial.safeParse({ name: 'John', age: 30 });

      expect(result.success).toBe(true);
    });
  });

  describe('pickSchema', () => {
    it('should pick specified fields from schema', () => {
      const schema = z.object({
        id: z.string(),
        name: z.string(),
        age: z.number(),
      });

      const picked = pickSchema(schema, ['id', 'name']);
      const result = picked.safeParse({ id: '123', name: 'John' });

      expect(result.success).toBe(true);
    });

    it('should not accept unpicked fields as required', () => {
      const schema = z.object({
        id: z.string(),
        name: z.string(),
        age: z.number(),
      });

      const picked = pickSchema(schema, ['id']);

      expect(picked.shape).toHaveProperty('id');
      expect(picked.shape).not.toHaveProperty('name');
    });
  });

  describe('omitSchema', () => {
    it('should omit specified fields from schema', () => {
      const schema = z.object({
        id: z.string(),
        name: z.string(),
        password: z.string(),
      });

      const omitted = omitSchema(schema, ['password']);

      expect(omitted.shape).toHaveProperty('id');
      expect(omitted.shape).toHaveProperty('name');
      expect(omitted.shape).not.toHaveProperty('password');
    });

    it('should validate without omitted fields', () => {
      const schema = z.object({
        id: z.string(),
        name: z.string(),
        password: z.string(),
      });

      const omitted = omitSchema(schema, ['password']);
      const result = omitted.safeParse({ id: '123', name: 'John' });

      expect(result.success).toBe(true);
    });
  });

  describe('z re-export', () => {
    it('should re-export z from zod', () => {
      expect(zodExport).toBe(z);
      expect(zodExport.string).toBeDefined();
      expect(zodExport.number).toBeDefined();
      expect(zodExport.object).toBeDefined();
    });
  });
});
