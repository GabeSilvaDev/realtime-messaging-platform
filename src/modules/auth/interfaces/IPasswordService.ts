export interface IPasswordService {
  hash(password: string): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
  generateResetToken(): { token: string; hash: string };
  hashToken(token: string): string;
  verifyResetToken(token: string, hash: string): boolean;
}
