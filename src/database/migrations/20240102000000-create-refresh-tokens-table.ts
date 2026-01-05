'use strict';

import { QueryInterface, DataTypes } from 'sequelize';

export default {
  async up(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.createTable('refresh_tokens', {
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
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      token: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      is_revoked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      revoked_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      ip_address: {
        type: DataTypes.STRING(45),
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

    await queryInterface.addIndex('refresh_tokens', ['user_id'], {
      name: 'idx_refresh_tokens_user_id',
    });

    await queryInterface.addIndex('refresh_tokens', ['token'], {
      name: 'idx_refresh_tokens_token',
      unique: true,
    });

    await queryInterface.addIndex('refresh_tokens', ['expires_at'], {
      name: 'idx_refresh_tokens_expires_at',
    });
  },

  async down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.dropTable('refresh_tokens');
  },
};
