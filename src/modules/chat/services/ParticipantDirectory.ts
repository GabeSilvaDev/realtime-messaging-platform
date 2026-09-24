import { cacheService, type ICacheService } from '@/shared/cache';
import { CHAT_CACHE_KEYS, CHAT_CACHE_TTL_SECONDS } from '../constants';
import type { IParticipantRepository } from '../interfaces';
import { participantRepository } from '../repositories';
import type { ParticipantRole } from '../types';

/** O que o cache guarda de cada participante (o resto da linha muda a cada leitura). */
export interface ParticipantSummary {
  userId: string;
  role: ParticipantRole;
}

/**
 * Participantes por conversa (ids + papéis) no cache `cache:conv:participants:<id>` — o caminho
 * quente de toda mensagem enviada/listada. Invalidado por `chat:conversation-created/updated/
 * deleted` (`registerChatCacheListeners`); o TTL de 300 s cobre um evento perdido.
 */
export class ParticipantDirectory {
  constructor(
    private readonly participants: Pick<
      IParticipantRepository,
      'listByConversation'
    > = participantRepository,
    private readonly cache: Pick<ICacheService, 'getOrLoad'> = cacheService
  ) {}

  /** Do mais antigo para o mais novo (mesma ordem do repositório). */
  async list(conversationId: string): Promise<ParticipantSummary[]> {
    return this.cache.getOrLoad(
      CHAT_CACHE_KEYS.participants(conversationId),
      CHAT_CACHE_TTL_SECONDS,
      async () =>
        (await this.participants.listByConversation(conversationId)).map(({ userId, role }) => ({
          userId,
          role,
        }))
    );
  }

  async userIds(conversationId: string): Promise<string[]> {
    return (await this.list(conversationId)).map((participant) => participant.userId);
  }

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    return (await this.list(conversationId)).some((participant) => participant.userId === userId);
  }
}
