import { Types, type HydratedDocument } from 'mongoose';
import { MessageModel, type IMessage } from '../models/Message';
import type { IMessageRepository } from '../interfaces';
import type { CreateMessageData, FindMessagesOptions, MessageRecord } from '../types';

function toRecord(doc: HydratedDocument<IMessage>): MessageRecord {
  return {
    id: doc._id.toString(),
    conversationId: doc.conversationId,
    senderId: doc.senderId,
    content: { type: doc.content.type, text: doc.content.text },
    replyTo: doc.replyTo === null ? null : doc.replyTo.toString(),
    mentions: [...doc.mentions],
    metadata: { ip: doc.metadata.ip, device: doc.metadata.device },
    deletedAt: doc.deletedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MessageRepository implements IMessageRepository {
  async create(data: CreateMessageData): Promise<MessageRecord> {
    const doc = await MessageModel.create({
      ...data,
      replyTo: data.replyTo === null ? null : new Types.ObjectId(data.replyTo),
    });
    return toRecord(doc);
  }

  async findById(id: string): Promise<MessageRecord | null> {
    const doc = await MessageModel.findById(id).exec();
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
}

export const messageRepository = new MessageRepository();
