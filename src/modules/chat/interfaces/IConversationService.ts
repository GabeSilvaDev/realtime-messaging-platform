import type {
  ConversationDTO,
  CreateDirectResult,
  CreateGroupDTO,
  ListConversationsOptions,
  PaginatedConversations,
} from '../types';

export interface IConversationService {
  createDirect(userId: string, otherUserId: string): Promise<CreateDirectResult>;
  createGroup(userId: string, data: CreateGroupDTO): Promise<ConversationDTO>;
  list(userId: string, options?: ListConversationsOptions): Promise<PaginatedConversations>;
  get(userId: string, conversationId: string): Promise<ConversationDTO>;
  rename(userId: string, conversationId: string, name: string): Promise<ConversationDTO>;
  archive(userId: string, conversationId: string): Promise<void>;
  unarchive(userId: string, conversationId: string): Promise<void>;
  leave(userId: string, conversationId: string): Promise<void>;
  addMembers(userId: string, conversationId: string, userIds: string[]): Promise<ConversationDTO>;
  removeMember(userId: string, conversationId: string, memberId: string): Promise<void>;
  isParticipant(conversationId: string, userId: string): Promise<boolean>;
  getParticipantIds(conversationId: string): Promise<string[]>;
  getUserConversationIds(userId: string): Promise<string[]>;
}
