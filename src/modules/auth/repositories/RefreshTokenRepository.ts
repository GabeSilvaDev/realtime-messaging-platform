import { RefreshToken } from '../models/RefreshToken';

export class RefreshTokenRepository {
  async create(data: {
    userId: string;
    token: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<RefreshToken> {
    return RefreshToken.create(data);
  }

  async findByToken(token: string): Promise<RefreshToken | null> {
    return RefreshToken.findOne({ where: { token, isRevoked: false } });
  }

  async findById(id: string): Promise<RefreshToken | null> {
    return RefreshToken.findByPk(id);
  }

  async findActiveByUserId(userId: string): Promise<RefreshToken[]> {
    return RefreshToken.findAll({ where: { userId, isRevoked: false } });
  }

  async revoke(token: RefreshToken): Promise<void> {
    token.isRevoked = true;
    token.revokedAt = new Date();
    await token.save();
  }

  async revokeByToken(token: string): Promise<boolean> {
    const [count] = await RefreshToken.update(
      { isRevoked: true, revokedAt: new Date() },
      { where: { token, isRevoked: false } }
    );
    return count > 0;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const [count] = await RefreshToken.update(
      { isRevoked: true, revokedAt: new Date() },
      { where: { userId, isRevoked: false } }
    );
    return count;
  }

  async revokeAllExcept(userId: string, currentTokenId: string): Promise<number> {
    const tokens = await this.findActiveByUserId(userId);
    let count = 0;

    for (const token of tokens) {
      if (token.id !== currentTokenId) {
        await this.revoke(token);
        count++;
      }
    }

    return count;
  }

  async deleteExpired(): Promise<number> {
    return RefreshToken.destroy({
      where: {
        expiresAt: { $lt: new Date() },
      },
    });
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
