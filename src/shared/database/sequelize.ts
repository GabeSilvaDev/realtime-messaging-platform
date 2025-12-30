import { Sequelize } from 'sequelize';
import config from '../config/database';

const env = config.env;
const dbConfig = config.database[env];

const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
  host: dbConfig.host,
  port: dbConfig.port,
  dialect: dbConfig.dialect,
  logging: dbConfig.logging,
  define: dbConfig.define,
  pool: dbConfig.pool,
});

async function connectPostgres(): Promise<void> {
  await sequelize.authenticate();
}

async function disconnectPostgres(): Promise<void> {
  await sequelize.close();
}

export { sequelize, connectPostgres, disconnectPostgres };
export default sequelize;
