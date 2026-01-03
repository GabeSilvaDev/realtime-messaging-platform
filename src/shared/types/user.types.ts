export enum UserStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  AWAY = 'away',
  BUSY = 'busy',
}

export interface UserAttributes {
  id: string;
  username: string;
  email: string;
  password: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCreationAttributes {
  username: string;
  email: string;
  password: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  status?: UserStatus;
}

export interface CreateUserDTO {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface UpdateUserDTO {
  username?: string;
  email?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  status?: UserStatus;
}

export interface UpdatePasswordDTO {
  currentPassword: string;
  newPassword: string;
}

export interface UserPublicResponse {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  lastSeenAt: Date | null;
}

export interface UserPrivateResponse extends UserPublicResponse {
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserFilters {
  username?: string;
  email?: string;
  status?: UserStatus;
}
