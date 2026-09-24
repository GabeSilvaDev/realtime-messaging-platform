import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { CHAT_CONSTANTS, MESSAGE_CONTENT_TYPES } from '../constants';
import type { MessageContentType } from '../types';

export interface IMessage {
  conversationId: string;
  senderId: string;
  content: { type: MessageContentType; text: string };
  replyTo: Types.ObjectId | null;
  mentions: string[];
  metadata: { ip: string | null; device: string | null };
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const contentSchema = new Schema<IMessage['content']>(
  {
    type: { type: String, enum: MESSAGE_CONTENT_TYPES, required: true },
    text: { type: String, required: true, maxlength: CHAT_CONSTANTS.MAX_MESSAGE_LENGTH },
  },
  { _id: false }
);

const messageSchema = new Schema<IMessage>(
  {
    conversationId: { type: String, required: true },
    senderId: { type: String, required: true },
    content: { type: contentSchema, required: true },
    replyTo: { type: Schema.Types.ObjectId, default: null },
    mentions: { type: [String], default: [] },
    metadata: {
      ip: { type: String, default: null },
      device: { type: String, default: null },
    },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'messages',
  }
);

// Índice da paginação por cursor (mais recentes primeiro). O prefixo conversationId também
// atende consultas só por conversa, então não há índice simples separado.
messageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });

export const MessageModel: Model<IMessage> = mongoose.model<IMessage>('Message', messageSchema);
