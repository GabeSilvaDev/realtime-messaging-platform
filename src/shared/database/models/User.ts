import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../sequelize';
import type {
  UserAttributes,
  UserCreationAttributes,
  UserPublicResponse,
  UserPrivateResponse,
} from '../../types/user.types';
import { UserStatus } from '../../types/user.types';

class User
  extends Model<
    UserAttributes,
    Optional<UserCreationAttributes, 'displayName' | 'avatarUrl' | 'status'>
  >
  implements UserAttributes
{
  declare id: string;
  declare username: string;
  declare email: string;
  declare password: string;
  declare displayName: string | null;
  declare avatarUrl: string | null;
  declare status: UserStatus;
  declare lastSeenAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;

  toPublicJSON(): UserPublicResponse {
    return {
      id: this.id,
      username: this.username,
      displayName: this.displayName,
      avatarUrl: this.avatarUrl,
      status: this.status,
      lastSeenAt: this.lastSeenAt,
    };
  }

  toPrivateJSON(): UserPrivateResponse {
    return {
      ...this.toPublicJSON(),
      email: this.email,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 50],
        is: /^[a-zA-Z0-9_]+$/,
      },
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    displayName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    avatarUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      validate: {
        isUrl: true,
      },
    },
    status: {
      type: DataTypes.ENUM(...Object.values(UserStatus)),
      allowNull: false,
      defaultValue: UserStatus.OFFLINE,
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'users',
    modelName: 'User',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['username'], unique: true },
      { fields: ['email'], unique: true },
      { fields: ['status'] },
    ],
  }
);

export default User;
