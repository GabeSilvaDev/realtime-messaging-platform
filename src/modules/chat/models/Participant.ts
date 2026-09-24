import sequelize from '@/shared/database/sequelize';
import { DataTypes, Model, type Optional } from 'sequelize';
import { PARTICIPANT_ROLES } from '../constants';
import type {
  ParticipantAttributes,
  ParticipantCreationAttributes,
  ParticipantRole,
} from '../types';
import Conversation from './Conversation';

class Participant
  extends Model<ParticipantAttributes, Optional<ParticipantCreationAttributes, 'role' | 'joinedAt'>>
  implements ParticipantAttributes
{
  declare id: string;
  declare conversationId: string;
  declare userId: string;
  declare role: ParticipantRole;
  declare joinedAt: Date;
  declare lastReadAt: Date | null;
  declare isMuted: boolean;
  declare archivedAt: Date | null;

  declare conversation?: Conversation;

  toJSON(): ParticipantAttributes {
    return {
      id: this.id,
      conversationId: this.conversationId,
      userId: this.userId,
      role: this.role,
      joinedAt: this.joinedAt,
      lastReadAt: this.lastReadAt,
      isMuted: this.isMuted,
      archivedAt: this.archivedAt,
    };
  }
}

Participant.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    conversationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'conversation_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    role: {
      type: DataTypes.ENUM(...PARTICIPANT_ROLES),
      allowNull: false,
      defaultValue: 'member',
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'joined_at',
    },
    lastReadAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_read_at',
    },
    isMuted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_muted',
    },
    archivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'archived_at',
    },
  },
  {
    sequelize,
    tableName: 'participants',
    modelName: 'Participant',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['conversation_id', 'user_id'],
        name: 'participants_conversation_user_unique',
      },
    ],
  }
);

Participant.belongsTo(Conversation, {
  foreignKey: 'conversationId',
  as: 'conversation',
});

export default Participant;
