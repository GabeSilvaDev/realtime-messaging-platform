import type {
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
  findById(id: string): Promise<ConversationAttributes | null>;
  findByDirectKey(directKey: string): Promise<ConversationAttributes | null>;
  /** Cria a conversa 1:1 e os dois participantes; sob corrida, devolve a existente. */
  createDirect(data: CreateDirectData): Promise<CreateDirectRecord>;
  /** Cria o grupo com o criador como `admin` e os demais como `member`. */
  createGroup(data: CreateGroupData): Promise<ConversationAttributes>;
  listForUser(userId: string, options: ListForUserOptions): Promise<ConversationListPage>;
  rename(id: string, name: string): Promise<void>;
  /** Avança `last_message_at` (nunca retrocede). */
  touchLastMessageAt(id: string, at: Date): Promise<void>;
  delete(id: string): Promise<void>;
}
