import { Op } from 'sequelize';
import Participant from '../models/Participant';
import type { IParticipantRepository } from '../interfaces';
import type { ChatTransaction, ParticipantAttributes, ParticipantRole } from '../types';

const OLDEST_FIRST: [string, string][] = [
  ['joinedAt', 'ASC'],
  ['id', 'ASC'],
];

export class ParticipantRepository implements IParticipantRepository {
  async find(
    conversationId: string,
    userId: string,
    transaction?: ChatTransaction
  ): Promise<ParticipantAttributes | null> {
    const participant = await Participant.findOne({
      where: { conversationId, userId },
      transaction,
    });
    return participant?.toJSON() ?? null;
  }

  async listByConversation(
    conversationId: string,
    transaction?: ChatTransaction
  ): Promise<ParticipantAttributes[]> {
    const rows = await Participant.findAll({
      where: { conversationId },
      order: OLDEST_FIRST,
      transaction,
    });
    return rows.map((row) => row.toJSON());
  }

  async listByConversations(conversationIds: string[]): Promise<ParticipantAttributes[]> {
    if (conversationIds.length === 0) {
      return [];
    }
    const rows = await Participant.findAll({
      where: { conversationId: { [Op.in]: conversationIds } },
      order: OLDEST_FIRST,
    });
    return rows.map((row) => row.toJSON());
  }

  async listConversationIdsByUser(userId: string): Promise<string[]> {
    const rows = await Participant.findAll({ where: { userId }, attributes: ['conversationId'] });
    return rows.map((row) => row.conversationId);
  }

  async addMembers(
    conversationId: string,
    userIds: string[],
    transaction?: ChatTransaction
  ): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    await Participant.bulkCreate(
      userIds.map((userId) => ({ conversationId, userId, role: 'member' as const })),
      { ignoreDuplicates: true, transaction }
    );
  }

  async remove(
    conversationId: string,
    userId: string,
    transaction?: ChatTransaction
  ): Promise<void> {
    await Participant.destroy({ where: { conversationId, userId }, transaction });
  }

  async setRole(
    conversationId: string,
    userId: string,
    role: ParticipantRole,
    transaction?: ChatTransaction
  ): Promise<void> {
    await Participant.update({ role }, { where: { conversationId, userId }, transaction });
  }

  async setArchivedAt(
    conversationId: string,
    userId: string,
    archivedAt: Date | null
  ): Promise<void> {
    await Participant.update({ archivedAt }, { where: { conversationId, userId } });
  }
}

export const participantRepository = new ParticipantRepository();
