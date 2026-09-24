import { DataTypes, QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('contacts', 'last_interaction_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await queryInterface.addIndex('contacts', ['user_id', 'last_interaction_at'], {
    name: 'contacts_user_last_interaction_index',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('contacts', 'contacts_user_last_interaction_index');
  await queryInterface.removeColumn('contacts', 'last_interaction_at');
}
