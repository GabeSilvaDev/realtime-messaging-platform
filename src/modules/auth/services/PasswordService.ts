import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export class PasswordService {
  private readonly saltRounds = 12;

  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateResetToken(): { token: string; hash: string } {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    return { token, hash };
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  verifyResetToken(token: string, hash: string): boolean {
    const tokenHash = this.hashToken(token);
    return crypto.timingSafeEqual(Buffer.from(tokenHash), Buffer.from(hash));
  }
}

export const passwordService = new PasswordService();
