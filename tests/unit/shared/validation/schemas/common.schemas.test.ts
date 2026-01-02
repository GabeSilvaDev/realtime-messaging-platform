import {
  uuidSchema,
  emailSchema,
  usernameSchema,
  passwordSchema,
  displayNameSchema,
  positiveIntSchema,
  messageTypeSchema,
  userStatusSchema,
  booleanStringSchema,
} from '@/shared/validation/schemas/common.schemas';

describe('Common Schemas', () => {
  describe('uuidSchema', () => {
    it('should validate a valid UUID', () => {
      const result = uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000');
      expect(result.success).toBe(true);
    });

    it('should reject an invalid UUID', () => {
      const result = uuidSchema.safeParse('invalid-uuid');
      expect(result.success).toBe(false);
    });
  });

  describe('emailSchema', () => {
    it('should validate a valid email', () => {
      const result = emailSchema.safeParse('test@example.com');
      expect(result.success).toBe(true);
    });

    it('should reject an invalid email', () => {
      const result = emailSchema.safeParse('invalid-email');
      expect(result.success).toBe(false);
    });

    it('should transform email to lowercase', () => {
      const result = emailSchema.safeParse('TEST@EXAMPLE.COM');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('test@example.com');
      }
    });
  });

  describe('usernameSchema', () => {
    it('should validate a valid username', () => {
      const result = usernameSchema.safeParse('john_doe');
      expect(result.success).toBe(true);
    });

    it('should reject username with special characters', () => {
      const result = usernameSchema.safeParse('john@doe');
      expect(result.success).toBe(false);
    });

    it('should reject username too short', () => {
      const result = usernameSchema.safeParse('ab');
      expect(result.success).toBe(false);
    });
  });

  describe('passwordSchema', () => {
    it('should validate a strong password', () => {
      const result = passwordSchema.safeParse('Password123!');
      expect(result.success).toBe(true);
    });

    it('should reject password without uppercase', () => {
      const result = passwordSchema.safeParse('password123!');
      expect(result.success).toBe(false);
    });

    it('should reject password without number', () => {
      const result = passwordSchema.safeParse('Password!');
      expect(result.success).toBe(false);
    });

    it('should reject password too short', () => {
      const result = passwordSchema.safeParse('Pass1!');
      expect(result.success).toBe(false);
    });
  });

  describe('displayNameSchema', () => {
    it('should validate a valid display name', () => {
      const result = displayNameSchema.safeParse('John Doe');
      expect(result.success).toBe(true);
    });

    it('should reject display name too short', () => {
      const result = displayNameSchema.safeParse('J');
      expect(result.success).toBe(false);
    });
  });

  describe('positiveIntSchema', () => {
    it('should validate a positive integer', () => {
      const result = positiveIntSchema.safeParse(42);
      expect(result.success).toBe(true);
    });

    it('should reject zero', () => {
      const result = positiveIntSchema.safeParse(0);
      expect(result.success).toBe(false);
    });

    it('should reject negative numbers', () => {
      const result = positiveIntSchema.safeParse(-1);
      expect(result.success).toBe(false);
    });
  });

  describe('messageTypeSchema', () => {
    it('should validate valid message types', () => {
      expect(messageTypeSchema.safeParse('text').success).toBe(true);
      expect(messageTypeSchema.safeParse('image').success).toBe(true);
      expect(messageTypeSchema.safeParse('video').success).toBe(true);
    });

    it('should reject invalid message type', () => {
      const result = messageTypeSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('userStatusSchema', () => {
    it('should validate valid user statuses', () => {
      expect(userStatusSchema.safeParse('online').success).toBe(true);
      expect(userStatusSchema.safeParse('offline').success).toBe(true);
      expect(userStatusSchema.safeParse('away').success).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = userStatusSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('booleanStringSchema', () => {
    it('should transform "true" to true', () => {
      const result = booleanStringSchema.safeParse('true');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should transform "1" to true', () => {
      const result = booleanStringSchema.safeParse('1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should transform "false" to false', () => {
      const result = booleanStringSchema.safeParse('false');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('should transform "0" to false', () => {
      const result = booleanStringSchema.safeParse('0');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('should reject invalid boolean strings', () => {
      const result = booleanStringSchema.safeParse('yes');
      expect(result.success).toBe(false);
    });
  });
});
