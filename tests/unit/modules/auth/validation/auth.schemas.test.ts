import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '@/modules/auth/validation/auth.schemas';

describe('Auth Validation Schemas', () => {
  describe('registerSchema', () => {
    const validData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password123!',
      displayName: 'Test User',
    };

    it('should validate correct registration data', () => {
      const result = registerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should transform email to lowercase', () => {
      const result = registerSchema.parse({ ...validData, email: 'TEST@EXAMPLE.COM' });
      expect(result.email).toBe('test@example.com');
    });

    it('should transform username to lowercase', () => {
      const result = registerSchema.parse({ ...validData, username: 'TestUser' });
      expect(result.username).toBe('testuser');
    });

    it('should allow underscores in username', () => {
      const result = registerSchema.safeParse({ ...validData, username: 'test_user' });
      expect(result.success).toBe(true);
    });

    it('should fail with short password', () => {
      const result = registerSchema.safeParse({ ...validData, password: 'Pass1!' });
      expect(result.success).toBe(false);
    });

    it('should fail without uppercase in password', () => {
      const result = registerSchema.safeParse({ ...validData, password: 'password123!' });
      expect(result.success).toBe(false);
    });

    it('should fail without lowercase in password', () => {
      const result = registerSchema.safeParse({ ...validData, password: 'PASSWORD123!' });
      expect(result.success).toBe(false);
    });

    it('should fail without number in password', () => {
      const result = registerSchema.safeParse({ ...validData, password: 'Password!' });
      expect(result.success).toBe(false);
    });

    it('should fail without special character in password', () => {
      const result = registerSchema.safeParse({ ...validData, password: 'Password123' });
      expect(result.success).toBe(false);
    });

    it('should allow optional displayName', () => {
      const { displayName: _, ...dataWithoutDisplayName } = validData;
      const result = registerSchema.safeParse(dataWithoutDisplayName);
      expect(result.success).toBe(true);
    });

    it('should fail with short displayName', () => {
      const result = registerSchema.safeParse({ ...validData, displayName: 'A' });
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    const validData = {
      email: 'test@example.com',
      password: 'anypassword',
    };

    it('should validate correct login data', () => {
      const result = loginSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should transform email to lowercase', () => {
      const result = loginSchema.parse({ ...validData, email: 'TEST@EXAMPLE.COM' });
      expect(result.email).toBe('test@example.com');
    });

    it('should fail with invalid email', () => {
      const result = loginSchema.safeParse({ ...validData, email: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should fail with empty password', () => {
      const result = loginSchema.safeParse({ ...validData, password: '' });
      expect(result.success).toBe(false);
    });

    it('should fail without email', () => {
      const result = loginSchema.safeParse({ password: 'password' });
      expect(result.success).toBe(false);
    });

    it('should fail without password', () => {
      const result = loginSchema.safeParse({ email: 'test@example.com' });
      expect(result.success).toBe(false);
    });
  });

  describe('refreshTokenSchema', () => {
    it('should validate correct refresh token', () => {
      const result = refreshTokenSchema.safeParse({ refreshToken: 'valid-token' });
      expect(result.success).toBe(true);
    });

    it('should fail with empty refresh token', () => {
      const result = refreshTokenSchema.safeParse({ refreshToken: '' });
      expect(result.success).toBe(false);
    });

    it('should fail without refresh token', () => {
      const result = refreshTokenSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('forgotPasswordSchema', () => {
    it('should validate correct email', () => {
      const result = forgotPasswordSchema.safeParse({ email: 'test@example.com' });
      expect(result.success).toBe(true);
    });

    it('should transform email to lowercase', () => {
      const result = forgotPasswordSchema.parse({ email: 'TEST@EXAMPLE.COM' });
      expect(result.email).toBe('test@example.com');
    });

    it('should fail with invalid email', () => {
      const result = forgotPasswordSchema.safeParse({ email: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should fail without email', () => {
      const result = forgotPasswordSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('resetPasswordSchema', () => {
    const validData = {
      token: 'reset-token',
      newPassword: 'NewPassword123!',
    };

    it('should validate correct reset password data', () => {
      const result = resetPasswordSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail with empty token', () => {
      const result = resetPasswordSchema.safeParse({ ...validData, token: '' });
      expect(result.success).toBe(false);
    });

    it('should fail with weak password', () => {
      const result = resetPasswordSchema.safeParse({ ...validData, newPassword: '123' });
      expect(result.success).toBe(false);
    });

    it('should fail without token', () => {
      const result = resetPasswordSchema.safeParse({ newPassword: 'NewPassword123!' });
      expect(result.success).toBe(false);
    });

    it('should fail without newPassword', () => {
      const result = resetPasswordSchema.safeParse({ token: 'token' });
      expect(result.success).toBe(false);
    });
  });

  describe('changePasswordSchema', () => {
    const validData = {
      currentPassword: 'currentpass',
      newPassword: 'NewPassword123!',
    };

    it('should validate correct change password data', () => {
      const result = changePasswordSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail with empty currentPassword', () => {
      const result = changePasswordSchema.safeParse({ ...validData, currentPassword: '' });
      expect(result.success).toBe(false);
    });

    it('should fail with weak newPassword', () => {
      const result = changePasswordSchema.safeParse({ ...validData, newPassword: 'weak' });
      expect(result.success).toBe(false);
    });

    it('should fail without currentPassword', () => {
      const result = changePasswordSchema.safeParse({ newPassword: 'NewPassword123!' });
      expect(result.success).toBe(false);
    });

    it('should fail without newPassword', () => {
      const result = changePasswordSchema.safeParse({ currentPassword: 'current' });
      expect(result.success).toBe(false);
    });
  });
});
