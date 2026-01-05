import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PasswordService } from '@/modules/auth/services/PasswordService';

jest.mock('bcryptjs');
jest.mock('crypto');

const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PasswordService();
  });

  describe('hash', () => {
    it('should hash a password with salt rounds of 12', async () => {
      const password = 'MySecurePassword123';
      const hashedPassword = '$2a$12$hashedpassword';

      mockBcrypt.hash.mockResolvedValue(hashedPassword as never);

      const result = await service.hash(password);

      expect(mockBcrypt.hash).toHaveBeenCalledWith(password, 12);
      expect(result).toBe(hashedPassword);
    });

    it('should handle empty password', async () => {
      mockBcrypt.hash.mockResolvedValue('$2a$12$emptyhash' as never);

      const result = await service.hash('');

      expect(mockBcrypt.hash).toHaveBeenCalledWith('', 12);
      expect(result).toBe('$2a$12$emptyhash');
    });
  });

  describe('compare', () => {
    it('should return true for matching password and hash', async () => {
      const password = 'MySecurePassword123';
      const hash = '$2a$12$hashedpassword';

      mockBcrypt.compare.mockResolvedValue(true as never);

      const result = await service.compare(password, hash);

      expect(mockBcrypt.compare).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching password and hash', async () => {
      const password = 'WrongPassword';
      const hash = '$2a$12$hashedpassword';

      mockBcrypt.compare.mockResolvedValue(false as never);

      const result = await service.compare(password, hash);

      expect(mockBcrypt.compare).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(false);
    });
  });

  describe('generateResetToken', () => {
    it('should generate a token and its hash', () => {
      const mockRandomBytes = Buffer.from('a'.repeat(32));
      const mockHash = 'hashedtoken123';

      const mockUpdate = jest.fn().mockReturnValue({
        digest: jest.fn().mockReturnValue(mockHash),
      });

      mockCrypto.randomBytes.mockReturnValue(mockRandomBytes as never);
      mockCrypto.createHash.mockReturnValue({ update: mockUpdate } as never);

      const result = service.generateResetToken();

      expect(mockCrypto.randomBytes).toHaveBeenCalledWith(32);
      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('hash', mockHash);
    });
  });

  describe('hashToken', () => {
    it('should hash a token using SHA256', () => {
      const token = 'reset-token-123';
      const expectedHash = 'sha256hashofttoken';

      const mockUpdate = jest.fn().mockReturnValue({
        digest: jest.fn().mockReturnValue(expectedHash),
      });

      mockCrypto.createHash.mockReturnValue({ update: mockUpdate } as never);

      const result = service.hashToken(token);

      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
      expect(mockUpdate).toHaveBeenCalledWith(token);
      expect(result).toBe(expectedHash);
    });
  });

  describe('verifyResetToken', () => {
    it('should return true when token matches hash', () => {
      const token = 'valid-token';
      const hash = 'matching-hash';

      const mockUpdate = jest.fn().mockReturnValue({
        digest: jest.fn().mockReturnValue(hash),
      });

      mockCrypto.createHash.mockReturnValue({ update: mockUpdate } as never);
      mockCrypto.timingSafeEqual.mockReturnValue(true as never);

      const result = service.verifyResetToken(token, hash);

      expect(result).toBe(true);
      expect(mockCrypto.timingSafeEqual).toHaveBeenCalled();
    });

    it('should return false when token does not match hash', () => {
      const token = 'invalid-token';
      const hash = 'original-hash';

      const mockUpdate = jest.fn().mockReturnValue({
        digest: jest.fn().mockReturnValue('different-hash'),
      });

      mockCrypto.createHash.mockReturnValue({ update: mockUpdate } as never);
      mockCrypto.timingSafeEqual.mockReturnValue(false as never);

      const result = service.verifyResetToken(token, hash);

      expect(result).toBe(false);
    });
  });
});
