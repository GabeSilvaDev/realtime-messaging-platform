import { PasswordService } from '@/modules/auth/services/PasswordService';
import type { UserAttributes, UserStatus } from '@/shared/types';
import { userRepository } from '../repositories';
import type { IUserRepository, IUserService } from '../interfaces';
import {
  UserNotFoundException,
  EmailAlreadyExistsException,
  UsernameAlreadyExistsException,
  CannotDeleteSelfException,
} from '../errors';
import type {
  CreateUserDTO,
  PaginatedUsers,
  PublicUserDTO,
  UpdateUserDTO,
  UserListOptions,
  UserResponseDTO,
  UserSearchOptions,
  UserSearchResult,
} from '../types';

export {
  UserNotFoundException,
  EmailAlreadyExistsException,
  UsernameAlreadyExistsException,
  CannotDeleteSelfException,
} from '../errors';

export class UserService implements IUserService {
  constructor(
    private readonly users: IUserRepository = userRepository,
    private readonly passwords: PasswordService = new PasswordService()
  ) {}

  async findById(id: string): Promise<UserResponseDTO> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new UserNotFoundException();
    }
    return this.toUserResponse(user);
  }

  async findByIdPublic(id: string): Promise<PublicUserDTO> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new UserNotFoundException();
    }
    return this.toPublicUser(user);
  }

  async findByEmail(email: string): Promise<UserResponseDTO | null> {
    const user = await this.users.findByEmail(email.toLowerCase());
    return user ? this.toUserResponse(user) : null;
  }

  async findByUsername(username: string): Promise<PublicUserDTO | null> {
    const user = await this.users.findByUsername(username.toLowerCase());
    return user ? this.toPublicUser(user) : null;
  }

  async create(data: CreateUserDTO): Promise<UserResponseDTO> {
    const [emailExists, usernameExists] = await Promise.all([
      this.users.findByEmail(data.email.toLowerCase()),
      this.users.findByUsername(data.username.toLowerCase()),
    ]);

    if (emailExists) {
      throw new EmailAlreadyExistsException();
    }

    if (usernameExists) {
      throw new UsernameAlreadyExistsException();
    }

    const hashedPassword = await this.passwords.hash(data.password);

    const user = await this.users.create({
      ...data,
      password: hashedPassword,
    });

    return this.toUserResponse(user);
  }

  async update(id: string, data: UpdateUserDTO): Promise<UserResponseDTO> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new UserNotFoundException();
    }

    if (data.username !== undefined && data.username.toLowerCase() !== user.username) {
      const usernameExists = await this.users.findByUsername(data.username.toLowerCase());
      if (usernameExists) {
        throw new UsernameAlreadyExistsException();
      }
    }

    const updated = await this.users.update(id, {
      ...data,
      username: data.username?.toLowerCase(),
    });

    if (!updated) {
      throw new UserNotFoundException();
    }

    return this.toUserResponse(updated);
  }

  async delete(id: string, requestingUserId?: string): Promise<void> {
    if (requestingUserId !== undefined && id === requestingUserId) {
      throw new CannotDeleteSelfException();
    }

    const user = await this.users.findById(id);
    if (!user) {
      throw new UserNotFoundException();
    }

    const deleted = await this.users.delete(id);
    if (!deleted) {
      throw new UserNotFoundException();
    }
  }

  async search(options: UserSearchOptions): Promise<UserSearchResult> {
    return this.users.search(options);
  }

  async list(options: UserListOptions = {}): Promise<PaginatedUsers> {
    const { filters = {}, orderBy = 'username', order = 'ASC', limit = 20, offset = 0 } = options;

    const searchOptions: UserSearchOptions = {
      filters: {
        query: filters.search,
        status: filters.status,
        excludeUserId: filters.excludeIds?.[0],
      },
      limit,
      offset,
      orderBy,
      order,
    };

    const result = await this.users.search(searchOptions);

    return {
      users: result.users.map((u) => this.toPublicUser(u)),
      total: result.total,
      limit,
      offset,
      hasMore: result.hasMore,
    };
  }

  async exists(id: string): Promise<boolean> {
    const user = await this.users.findById(id);
    return user !== null;
  }

  async updateLastSeen(userId: string): Promise<void> {
    await this.users.updateLastSeen(userId);
  }

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    await this.users.updateStatus(userId, status);
  }

  async getMultiple(ids: string[]): Promise<PublicUserDTO[]> {
    const users = await this.users.findByIds(ids);
    return users.map((u) => this.toPublicUser(u));
  }

  private toUserResponse(user: UserAttributes): UserResponseDTO {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      lastSeenAt: user.lastSeenAt,
      createdAt: user.createdAt,
    };
  }

  private toPublicUser(user: UserAttributes): PublicUserDTO {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      lastSeenAt: user.lastSeenAt,
    };
  }
}

export const userService = new UserService();
