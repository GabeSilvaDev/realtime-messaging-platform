import type {
  ChatTransaction,
  ConversationAttributes,
  ConversationListPage,
  CreateDirectData,
  CreateDirectRecord,
  CreateGroupData,
} from '../types';

export interface ListForUserOptions {
  archived: boolean;
  limit: number;
  offset: number;
}

export interface IConversationRepository {
  findById(id: string, transaction?: ChatTransaction): Promise<ConversationAttributes | null>;
  findByDirectKey(directKey: string): Promise<ConversationAttributes | null>;
  /** Cria a conversa 1:1 e os dois participantes; sob corrida, devolve a existente. */
  createDirect(data: CreateDirectData): Promise<CreateDirectRecord>;
  /** Cria o grupo com o criador como `admin` e os demais como `member`. */
  createGroup(data: CreateGroupData): Promise<ConversationAttributes>;
  listForUser(userId: string, options: ListForUserOptions): Promise<ConversationListPage>;
  rename(id: string, name: string): Promise<void>;
  /** Avança `last_message_at` (nunca retrocede). */
  touchLastMessageAt(id: string, at: Date): Promise<void>;
  delete(id: string, transaction?: ChatTransaction): Promise<void>;
  /**
   * Abre uma transação, trava a linha da conversa (`SELECT ... FOR UPDATE`) e executa `work`
   * com ela; commit ao resolver, rollback ao rejeitar. Serializa alterações concorrentes de
   * participantes (promoção de admin, limite do grupo). Conversa inexistente não trava nada —
   * `work` roda assim mesmo e decide (ex.: 404).
   */
  withLock<T>(
    conversationId: string,
    work: (transaction: ChatTransaction) => Promise<T>
  ): Promise<T>;
}
