import { DataTypes, QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('contacts', 'created_by_block', {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('contacts', 'created_by_block');
}
