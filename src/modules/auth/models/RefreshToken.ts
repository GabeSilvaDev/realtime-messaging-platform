import { DataTypes, Model } from 'sequelize';
import { sequelize } from '@/shared/database';
import type { RefreshTokenAttributes, RefreshTokenCreation } from '../types';

export class RefreshToken
  extends Model<RefreshTokenAttributes, RefreshTokenCreation>
  implements RefreshTokenAttributes
{
  declare id: string;
  declare userId: string;
  declare token: string;
  declare expiresAt: Date;
  declare isRevoked: boolean;
  declare revokedAt: Date | null;
  declare userAgent: string | null;
  declare ipAddress: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;

  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  isValid(): boolean {
    return !this.isRevoked && !this.isExpired();
  }
}

RefreshToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
    },
    isRevoked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_revoked',
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'revoked_at',
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'user_agent',
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address',
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'refresh_tokens',
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['token'], unique: true },
      { fields: ['expires_at'] },
    ],
  }
);
