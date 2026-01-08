import { DataTypes, QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('contacts', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    contact_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    nickname: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    is_blocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_favorite: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    blocked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await queryInterface.addIndex('contacts', ['user_id', 'contact_id'], {
    unique: true,
    name: 'contacts_user_contact_unique',
  });

  await queryInterface.addIndex('contacts', ['user_id'], {
    name: 'contacts_user_id_index',
  });

  await queryInterface.addIndex('contacts', ['contact_id'], {
    name: 'contacts_contact_id_index',
  });

  await queryInterface.addIndex('contacts', ['user_id', 'is_blocked'], {
    name: 'contacts_user_blocked_index',
  });

  await queryInterface.addIndex('contacts', ['user_id', 'is_favorite'], {
    name: 'contacts_user_favorite_index',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('contacts');
}
