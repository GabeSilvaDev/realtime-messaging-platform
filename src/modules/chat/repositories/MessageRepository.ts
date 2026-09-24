import { Types, type HydratedDocument } from 'mongoose';
import { MessageModel, type IMessage } from '../models/Message';
import type { IMessageRepository } from '../interfaces';
import type {
  CreateMessageData,
  CreateMessageResult,
  FindMessagesOptions,
  MessageRecord,
  MessageStatusEntry,
} from '../types';

/** Código do MongoDB para violação de índice único. */
const DUPLICATE_KEY_ERROR_CODE = 11000;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_ERROR_CODE
  );
}

function toStatusEntries(entries: readonly MessageStatusEntry[]): MessageStatusEntry[] {
  return entries.map(({ userId, at }) => ({ userId, at }));
}

function toRecord(doc: HydratedDocument<IMessage>): MessageRecord {
  return {
    id: doc._id.toString(),
    conversationId: doc.conversationId,
    senderId: doc.senderId,
    content: { type: doc.content.type, text: doc.content.text },
    replyTo: doc.replyTo === null ? null : doc.replyTo.toString(),
    mentions: [...doc.mentions],
    metadata: { ip: doc.metadata.ip, device: doc.metadata.device },
    clientMessageId: doc.clientMessageId,
    deliveredTo: toStatusEntries(doc.deliveredTo),
    readBy: toStatusEntries(doc.readBy),
    deletedAt: doc.deletedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MessageRepository implements IMessageRepository {
  async create(data: CreateMessageData): Promise<CreateMessageResult> {
    try {
      const doc = await MessageModel.create({
        ...data,
        replyTo: data.replyTo === null ? null : new Types.ObjectId(data.replyTo),
      });
      return { record: toRecord(doc), created: true };
    } catch (error) {
      // Reenvio concorrente com o mesmo clientMessageId: o índice único barra o segundo, que
      // devolve a mensagem gravada pelo primeiro.
      if (data.clientMessageId === null || !isDuplicateKeyError(error)) {
        throw error;
      }
      const existing = await this.findByClientMessageId(data.senderId, data.clientMessageId);
      if (existing === null) {
        throw error;
      }
      return { record: existing, created: false };
    }
  }

  async findById(id: string): Promise<MessageRecord | null> {
    const doc = await MessageModel.findById(id).exec();
    return doc === null ? null : toRecord(doc);
  }

  async findByClientMessageId(
    senderId: string,
    clientMessageId: string
  ): Promise<MessageRecord | null> {
    const doc = await MessageModel.findOne({ senderId, clientMessageId }).exec();
    return doc === null ? null : toRecord(doc);
  }

  async findByConversation(
    conversationId: string,
    { limit, before }: FindMessagesOptions
  ): Promise<MessageRecord[]> {
    const filter =
      before === undefined
        ? { conversationId }
        : {
            conversationId,
            $or: [
              { createdAt: { $lt: before.createdAt } },
              { createdAt: before.createdAt, _id: { $lt: new Types.ObjectId(before.id) } },
            ],
          };

    const docs = await MessageModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .exec();
    return docs.map(toRecord);
  }

  async softDelete(id: string, deletedAt: Date): Promise<boolean> {
    const result = await MessageModel.updateOne(
      { _id: id, deletedAt: null },
      { $set: { deletedAt } }
    ).exec();
    return result.modifiedCount > 0;
  }

  async markDelivered(messageId: string, userId: string, at: Date): Promise<boolean> {
    const result = await MessageModel.updateOne(
      { _id: messageId, 'deliveredTo.userId': { $ne: userId } },
      { $push: { deliveredTo: { userId, at } } }
    ).exec();
    return result.modifiedCount > 0;
  }

  async markReadUpTo(
    conversationId: string,
    userId: string,
    upTo: Date,
    at: Date
  ): Promise<number> {
    const fromOthers = {
      conversationId,
      createdAt: { $lte: upTo },
      senderId: { $ne: userId },
      deletedAt: null,
    };

    // Ler implica entregue: completa deliveredTo antes de registrar a leitura.
    await MessageModel.updateMany(
      { ...fromOthers, 'deliveredTo.userId': { $ne: userId } },
      { $push: { deliveredTo: { userId, at } } }
    ).exec();
    const result = await MessageModel.updateMany(
      { ...fromOthers, 'readBy.userId': { $ne: userId } },
      { $push: { readBy: { userId, at } } }
    ).exec();
    return result.modifiedCount;
  }

  async deleteByConversation(conversationId: string): Promise<number> {
    const result = await MessageModel.deleteMany({ conversationId }).exec();
    return result.deletedCount;
  }
}

export const messageRepository = new MessageRepository();
