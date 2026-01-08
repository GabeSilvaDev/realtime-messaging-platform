import type { ContactAttributes, ContactCreationAttributes } from '@/modules/user/types';
import User from '@/shared/database/models/User';
import sequelize from '@/shared/database/sequelize';
import { DataTypes, Model, Optional } from 'sequelize';

class Contact
  extends Model<ContactAttributes, Optional<ContactCreationAttributes, 'nickname' | 'isFavorite'>>
  implements ContactAttributes
{
  declare id: string;
  declare userId: string;
  declare contactId: string;
  declare nickname: string | null;
  declare isBlocked: boolean;
  declare isFavorite: boolean;
  declare blockedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;

  declare user?: User;
  declare contact?: User;

  toJSON(): ContactAttributes {
    return {
      id: this.id,
      userId: this.userId,
      contactId: this.contactId,
      nickname: this.nickname,
      isBlocked: this.isBlocked,
      isFavorite: this.isFavorite,
      blockedAt: this.blockedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

Contact.init(
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
      references: {
        model: 'users',
        key: 'id',
      },
    },
    contactId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'contact_id',
      references: {
        model: 'users',
        key: 'id',
      },
    },
    nickname: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    isBlocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_blocked',
    },
    isFavorite: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_favorite',
    },
    blockedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'blocked_at',
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
    tableName: 'contacts',
    modelName: 'Contact',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'contact_id'],
        name: 'contacts_user_contact_unique',
      },
    ],
  }
);

Contact.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});

Contact.belongsTo(User, {
  foreignKey: 'contactId',
  as: 'contact',
});

export default Contact;
