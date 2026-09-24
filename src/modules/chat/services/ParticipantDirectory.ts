import { cacheService, DelayedCacheInvalidator, type ICacheService } from '@/shared/cache';
import {
  CHAT_CACHE_KEYS,
  CHAT_PARTICIPANTS_CACHE_DELAYED_DELETE_MS,
  CHAT_PARTICIPANTS_CACHE_TTL_SECONDS,
} from '../constants';
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
 * quente de toda mensagem enviada/listada. Invalidado por chamadas diretas a `forget()` (após
 * transação de mudança de membros) e por `chat:conversation-created/updated/deleted` eventos
 * (`registerChatCacheListeners`). Janela residual: ≤ CHAT_PARTICIPANTS_CACHE_DELAYED_DELETE_MS
 * (se ambos os DELs falharem) ou ≤ CHAT_PARTICIPANTS_CACHE_TTL_SECONDS (se aguardar TTL).
 * Não cacheia listas vazias (conversas desconhecidas).
 */
export class ParticipantDirectory {
  private readonly invalidator: DelayedCacheInvalidator;

  constructor(
    private readonly participants: Pick<
      IParticipantRepository,
      'listByConversation'
    > = participantRepository,
    private readonly cache: Pick<ICacheService, 'get' | 'set' | 'del'> = cacheService,
    delayedDeleteMs: number = CHAT_PARTICIPANTS_CACHE_DELAYED_DELETE_MS
  ) {
    this.invalidator = new DelayedCacheInvalidator(cache, delayedDeleteMs);
  }

  /** Do mais antigo para o mais novo (mesma ordem do repositório). */
  async list(conversationId: string): Promise<ParticipantSummary[]> {
    const key = CHAT_CACHE_KEYS.participants(conversationId);

    // Tenta carregar do cache
    const cached = await this.cache.get<ParticipantSummary[]>(key);
    if (cached !== null) {
      return cached;
    }

    // Carrega do repositório
    const participants = await this.participants.listByConversation(conversationId);
    const summaries = participants.map(({ userId, role }) => ({
      userId,
      role,
    }));

    // Cacheia apenas se não está vazio (conversas desconhecidas não são cacheadas)
    if (summaries.length > 0) {
      await this.cache.set(key, summaries, CHAT_PARTICIPANTS_CACHE_TTL_SECONDS);
    }

    return summaries;
  }

  async userIds(conversationId: string): Promise<string[]> {
    return (await this.list(conversationId)).map((participant) => participant.userId);
  }

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    return (await this.list(conversationId)).some((participant) => participant.userId === userId);
  }

  /**
   * Invalida o cache imediatamente e agenda um segundo DEL após delay (mitigação de
   * write-back stale; `DelayedCacheInvalidator`). Chamado diretamente em ConversationService após
   * transação de mudança de membros, antes de publish. O EventBus listener fornece fallback.
   */
  async forget(conversationId: string): Promise<void> {
    await this.invalidator.forget(CHAT_CACHE_KEYS.participants(conversationId));
  }
}
