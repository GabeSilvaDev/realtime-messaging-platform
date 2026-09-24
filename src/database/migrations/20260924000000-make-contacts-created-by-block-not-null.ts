import { DataTypes, QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    'UPDATE contacts SET created_by_block = false WHERE created_by_block IS NULL'
  );
  await queryInterface.changeColumn('contacts', 'created_by_block', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.changeColumn('contacts', 'created_by_block', {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  });
}
