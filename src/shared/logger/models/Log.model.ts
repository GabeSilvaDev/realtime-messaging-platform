import mongoose, { Schema, Model, Document } from 'mongoose';
import { LogLevel, LogCategory } from '../../types/logger.types';
import type { ILogDocument } from '../../interfaces/logger.interfaces';

type ILogDocumentModel = ILogDocument & Document;

const logSchema = new Schema<ILogDocumentModel>(
  {
    level: {
      type: String,
      enum: Object.values(LogLevel),
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: Object.values(LogCategory),
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    error: {
      name: String,
      message: String,
      stack: String,
      code: String,
    },
    context: {
      type: String,
      index: true,
    },
    service: {
      type: String,
      required: true,
      index: true,
    },
    environment: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'logs',
  }
);

logSchema.index({ level: 1, timestamp: -1 });
logSchema.index({ category: 1, timestamp: -1 });
logSchema.index({ 'metadata.userId': 1, timestamp: -1 });
logSchema.index({ 'metadata.requestId': 1 });
logSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LogModel: Model<ILogDocumentModel> = mongoose.model<ILogDocumentModel>(
  'Log',
  logSchema
);
