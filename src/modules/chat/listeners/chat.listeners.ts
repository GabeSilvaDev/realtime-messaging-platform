import type { IContactService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { ChatEvents } from '@/shared/types';

/**
 * Registra os subscribers do módulo de chat no EventBus. Chamado no bootstrap (após as
 * conexões); retorna uma função que cancela todas as inscrições.
 *
 * - MESSAGE_SENT em conversa direct → atualiza `last_interaction_at` dos contatos (RF002.2).
 */
export function registerChatListeners(
  bus: Pick<EventBus, 'subscribe'> = eventBus,
  contacts: Pick<IContactService, 'recordInteraction'> = contactService
): () => void {
  const unsubscribers = [
    bus.subscribe(ChatEvents.MESSAGE_SENT, async ({ payload }) => {
      if (payload.conversationType !== 'direct') {
        return;
      }
      const otherId = payload.participantIds.find((id) => id !== payload.senderId);
      if (otherId === undefined) {
        return;
      }
      await contacts.recordInteraction(payload.senderId, otherId);
    }),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
