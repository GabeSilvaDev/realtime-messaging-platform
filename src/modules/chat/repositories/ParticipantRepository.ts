import { Op, literal } from 'sequelize';
import Participant from '../models/Participant';
import type { IParticipantRepository } from '../interfaces';
import type { ChatTransaction, ParticipantAttributes, ParticipantRole } from '../types';

const OLDEST_FIRST: [string, string][] = [
  ['joinedAt', 'ASC'],
  ['id', 'ASC'],
];

/**
 * Conversas `direct` de `:userId`. O valor entra por `replacements` (nunca por interpolação).
 */
const DIRECT_CONVERSATIONS_OF_USER =
  '(SELECT p.conversation_id FROM participants p ' +
  'JOIN conversations c ON c.id = p.conversation_id ' +
  "WHERE p.user_id = :userId AND c.type = 'direct')";

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

  async listDirectPartnerIds(userId: string): Promise<string[]> {
    const rows = await Participant.findAll({
      where: {
        userId: { [Op.ne]: userId },
        conversationId: { [Op.in]: literal(DIRECT_CONVERSATIONS_OF_USER) },
      },
      attributes: ['userId'],
      replacements: { userId },
    });
    return rows.map((row) => row.userId);
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

  async advanceLastReadAt(conversationId: string, userId: string, at: Date): Promise<void> {
    await Participant.update(
      { lastReadAt: at },
      {
        where: {
          conversationId,
          userId,
          [Op.or]: [{ lastReadAt: null }, { lastReadAt: { [Op.lt]: at } }],
        },
      }
    );
  }
}

export const participantRepository = new ParticipantRepository();
