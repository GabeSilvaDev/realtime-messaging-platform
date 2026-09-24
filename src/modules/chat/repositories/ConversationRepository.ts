import sequelize from '@/shared/database/sequelize';
import { Op, UniqueConstraintError } from 'sequelize';
import Conversation from '../models/Conversation';
import Participant from '../models/Participant';
import type { IConversationRepository, ListForUserOptions } from '../interfaces';
import type {
  ChatTransaction,
  ConversationAttributes,
  ConversationListPage,
  CreateDirectData,
  CreateDirectRecord,
  CreateGroupData,
} from '../types';

export class ConversationRepository implements IConversationRepository {
  async findById(
    id: string,
    transaction?: ChatTransaction
  ): Promise<ConversationAttributes | null> {
    const conversation = await Conversation.findByPk(id, { transaction });
    return conversation?.toJSON() ?? null;
  }

  async findByDirectKey(directKey: string): Promise<ConversationAttributes | null> {
    const conversation = await Conversation.findOne({ where: { directKey } });
    return conversation?.toJSON() ?? null;
  }

  async createDirect({
    directKey,
    createdBy,
    userIds,
  }: CreateDirectData): Promise<CreateDirectRecord> {
    try {
      const conversation = await sequelize.transaction(async (transaction) => {
        const created = await Conversation.create(
          { type: 'direct', directKey, createdBy },
          { transaction }
        );
        await Participant.bulkCreate(
          userIds.map((userId) => ({
            conversationId: created.id,
            userId,
            role: 'member' as const,
          })),
          { transaction }
        );
        return created;
      });
      return { conversation: conversation.toJSON(), created: true };
    } catch (error) {
      // Duas requisições simultâneas para o mesmo par: o UNIQUE de direct_key barra a segunda,
      // que devolve a conversa criada pela primeira.
      if (!(error instanceof UniqueConstraintError)) {
        throw error;
      }
      const existing = await this.findByDirectKey(directKey);
      if (existing === null) {
        throw error;
      }
      return { conversation: existing, created: false };
    }
  }

  async createGroup({
    name,
    createdBy,
    memberIds,
  }: CreateGroupData): Promise<ConversationAttributes> {
    const conversation = await sequelize.transaction(async (transaction) => {
      const created = await Conversation.create(
        { type: 'group', name, createdBy },
        { transaction }
      );
      await Participant.bulkCreate(
        [
          { conversationId: created.id, userId: createdBy, role: 'admin' as const },
          ...memberIds.map((userId) => ({
            conversationId: created.id,
            userId,
            role: 'member' as const,
          })),
        ],
        { transaction }
      );
      return created;
    });
    return conversation.toJSON();
  }

  async listForUser(
    userId: string,
    { archived, limit, offset }: ListForUserOptions
  ): Promise<ConversationListPage> {
    const conversationAssociation = { model: Conversation, as: 'conversation' };
    const { count, rows } = await Participant.findAndCountAll({
      where: { userId, archivedAt: archived ? { [Op.ne]: null } : null },
      include: [{ model: Conversation, as: 'conversation', required: true }],
      order: [
        [conversationAssociation, 'lastMessageAt', 'DESC NULLS LAST'],
        [conversationAssociation, 'createdAt', 'DESC'],
        [conversationAssociation, 'id', 'DESC'],
      ],
      limit,
      offset,
    });

    return {
      total: count,
      rows: rows.flatMap((participant) =>
        participant.conversation
          ? [{ conversation: participant.conversation.toJSON(), membership: participant.toJSON() }]
          : []
      ),
    };
  }

  async rename(id: string, name: string): Promise<void> {
    await Conversation.update({ name }, { where: { id } });
  }

  async touchLastMessageAt(id: string, at: Date): Promise<void> {
    await Conversation.update(
      { lastMessageAt: at },
      {
        where: {
          id,
          [Op.or]: [{ lastMessageAt: null }, { lastMessageAt: { [Op.lt]: at } }],
        },
      }
    );
  }

  async delete(id: string, transaction?: ChatTransaction): Promise<void> {
    await Conversation.destroy({ where: { id }, transaction });
  }

  async withLock<T>(
    conversationId: string,
    work: (transaction: ChatTransaction) => Promise<T>
  ): Promise<T> {
    return sequelize.transaction(async (transaction) => {
      await Conversation.findByPk(conversationId, { transaction, lock: transaction.LOCK.UPDATE });
      return work(transaction);
    });
  }
}

export const conversationRepository = new ConversationRepository();
