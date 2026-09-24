import sequelize from '@/shared/database/sequelize';
import { DataTypes, Model, type Optional } from 'sequelize';
import { CONVERSATION_TYPES } from '../constants';
import type {
  ConversationAttributes,
  ConversationCreationAttributes,
  ConversationType,
} from '../types';

class Conversation
  extends Model<
    ConversationAttributes,
    Optional<
      ConversationCreationAttributes,
      'name' | 'avatarUrl' | 'createdBy' | 'directKey' | 'lastMessageAt'
    >
  >
  implements ConversationAttributes
{
  declare id: string;
  declare type: ConversationType;
  declare name: string | null;
  declare avatarUrl: string | null;
  declare createdBy: string | null;
  declare directKey: string | null;
  declare lastMessageAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;

  toJSON(): ConversationAttributes {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      avatarUrl: this.avatarUrl,
      createdBy: this.createdBy,
      directKey: this.directKey,
      lastMessageAt: this.lastMessageAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

Conversation.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM(...CONVERSATION_TYPES),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    avatarUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'avatar_url',
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
    },
    directKey: {
      type: DataTypes.STRING(73),
      allowNull: true,
      unique: true,
      field: 'direct_key',
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_message_at',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'conversations',
    modelName: 'Conversation',
    timestamps: true,
    underscored: true,
  }
);

export default Conversation;
