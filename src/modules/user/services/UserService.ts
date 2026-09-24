import { PasswordService } from '@/modules/auth/services/PasswordService';
import { cacheService, type ICacheService } from '@/shared/cache';
import type { UserAttributes, UserStatus } from '@/shared/types';
import { USER_CACHE_KEYS, USER_CACHE_TTL_SECONDS } from '../constants';
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

/** `PublicUserDTO` como volta do cache (JSON): datas viram strings ISO. */
type CachedPublicUser = Omit<PublicUserDTO, 'lastSeenAt'> & { lastSeenAt: string | null };

function reviveUser(cached: CachedPublicUser): PublicUserDTO {
  return { ...cached, lastSeenAt: cached.lastSeenAt === null ? null : new Date(cached.lastSeenAt) };
}

export class UserService implements IUserService {
  constructor(
    private readonly users: IUserRepository = userRepository,
    private readonly passwords: PasswordService = new PasswordService(),
    private readonly cache: Pick<ICacheService, 'mget' | 'setMany' | 'del'> = cacheService
  ) {}

  async findById(id: string): Promise<UserResponseDTO> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new UserNotFoundException();
    }
    return this.toUserResponse(user);
  }

  /** Perfil público via cache (`cache:user:<id>`). */
  async findByIdPublic(id: string): Promise<PublicUserDTO> {
    const [user] = await this.getMultiple([id]);
    if (user === undefined) {
      throw new UserNotFoundException();
    }
    return user;
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

    await this.forget(id);
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
    await this.forget(id);
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

  async updateLastSeen(userId: string, at: Date = new Date()): Promise<void> {
    await this.users.updateLastSeen(userId, at);
    await this.forget(userId);
  }

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    await this.users.updateStatus(userId, status);
    await this.forget(userId);
  }

  /**
   * Perfis públicos na ordem de `ids` (sem repetição; inexistentes ficam de fora). Lê do cache
   * (`cache:user:<id>`, um MGET) e busca no Postgres, numa só consulta `IN`, apenas os ausentes,
   * que passam a ser cacheados.
   */
  async getMultiple(ids: string[]): Promise<PublicUserDTO[]> {
    const unique = [...new Set(ids)];
    const cached = await this.cache.mget<CachedPublicUser>(unique.map(USER_CACHE_KEYS.publicUser));

    const byId = new Map<string, PublicUserDTO>();
    const missing: string[] = [];
    unique.forEach((id, index) => {
      const hit = cached[index] ?? null;
      if (hit === null) {
        missing.push(id);
      } else {
        byId.set(id, reviveUser(hit));
      }
    });

    if (missing.length > 0) {
      const loaded = (await this.users.findByIds(missing)).map((u) => this.toPublicUser(u));
      await this.cache.setMany(
        loaded.map((user) => [USER_CACHE_KEYS.publicUser(user.id), user]),
        USER_CACHE_TTL_SECONDS
      );
      loaded.forEach((user) => byId.set(user.id, user));
    }

    return unique.flatMap((id) => {
      const user = byId.get(id);
      return user === undefined ? [] : [user];
    });
  }

  /** Escritas do próprio service invalidam o perfil público cacheado. */
  private async forget(userId: string): Promise<void> {
    await this.cache.del(USER_CACHE_KEYS.publicUser(userId));
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
