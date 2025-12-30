import mongoose from 'mongoose';
import config from '../config/database';

const mongoConfig = config.mongo;

mongoose.set('strictQuery', true);

async function connectMongo(): Promise<typeof mongoose> {
  return mongoose.connect(mongoConfig.uri, mongoConfig.options);
}

async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

export { mongoose, connectMongo, disconnectMongo };
export default mongoose;
