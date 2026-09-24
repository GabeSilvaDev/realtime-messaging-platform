import type { CONVERSATION_TYPES, PARTICIPANT_ROLES } from '../constants';

export type { MessageContentType } from '@/shared/types/chat-message.types';
export type ConversationType = (typeof CONVERSATION_TYPES)[number];
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
export type ConversationChange = 'renamed' | 'members_added' | 'member_removed' | 'member_left';

export interface ConversationAttributes {
  id: string;
  type: ConversationType;
  name: string | null;
  avatarUrl: string | null;
  createdBy: string | null;
  directKey: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationCreationAttributes {
  type: ConversationType;
  name?: string | null;
  avatarUrl?: string | null;
  createdBy?: string | null;
  directKey?: string | null;
  lastMessageAt?: Date | null;
}

export interface ParticipantAttributes {
  id: string;
  conversationId: string;
  userId: string;
  role: ParticipantRole;
  joinedAt: Date;
  lastReadAt: Date | null;
  isMuted: boolean;
  archivedAt: Date | null;
}

export interface ParticipantCreationAttributes {
  conversationId: string;
  userId: string;
  role?: ParticipantRole;
  joinedAt?: Date;
}

export interface ParticipantUserDTO {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: ParticipantRole;
}

export interface MembershipDTO {
  role: ParticipantRole;
  isMuted: boolean;
  archivedAt: Date | null;
}

export interface ConversationDTO {
  id: string;
  type: ConversationType;
  name: string | null;
  avatarUrl: string | null;
  createdBy: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  participants: ParticipantUserDTO[];
  membership: MembershipDTO;
}

export interface CreateDirectResult {
  conversation: ConversationDTO;
  created: boolean;
}

export interface CreateGroupDTO {
  name: string;
  participantIds: string[];
}

export interface ListConversationsOptions {
  archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface PaginatedConversations {
  items: ConversationDTO[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ConversationListEntry {
  conversation: ConversationAttributes;
  membership: ParticipantAttributes;
}

export interface ConversationListPage {
  rows: ConversationListEntry[];
  total: number;
}

export interface CreateDirectData {
  directKey: string;
  createdBy: string;
  userIds: [string, string];
}

export interface CreateDirectRecord {
  conversation: ConversationAttributes;
  created: boolean;
}

export interface CreateGroupData {
  name: string;
  createdBy: string;
  memberIds: string[];
}
