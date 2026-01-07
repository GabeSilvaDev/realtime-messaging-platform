import type { UserPrivateResponse, UserPublicResponse } from '@/shared/types/user.types';
import { UserStatus } from '@/shared/types/user.types';

describe('User Model', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let User: any;

  beforeAll(() => {
    jest.resetModules();
    
    jest.doMock('sequelize', () => {
      const actual = jest.requireActual('sequelize');
      return {
        ...actual,
        Model: class MockModel {
          static init() {
            return this;
          }
        },
      };
    });

    jest.doMock('@/shared/database/sequelize', () => ({
      default: {},
      __esModule: true,
    }));

    const userModule = require('@/shared/database/models/User');
    User = userModule.User || userModule.default;
  });

  afterAll(() => {
    jest.resetModules();
  });

  function createUserInstance(data: {
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
  }) {
    const instance = Object.create(User.prototype);
    Object.assign(instance, data);
    return instance as {
      toPublicJSON: () => UserPublicResponse;
      toPrivateJSON: () => UserPrivateResponse;
    };
  }

  describe('toPublicJSON', () => {
    it('should return public user data without sensitive fields', () => {
      const userData = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashedpassword',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
        status: UserStatus.ONLINE,
        lastSeenAt: new Date('2025-01-01T12:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-06-01T00:00:00Z'),
      };

      const user = createUserInstance(userData);
      const publicJSON = user.toPublicJSON();

      expect(publicJSON).toEqual({
        id: 'user-123',
        username: 'testuser',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
        status: UserStatus.ONLINE,
        lastSeenAt: userData.lastSeenAt,
      });

      expect(publicJSON).not.toHaveProperty('email');
      expect(publicJSON).not.toHaveProperty('password');
      expect(publicJSON).not.toHaveProperty('createdAt');
      expect(publicJSON).not.toHaveProperty('updatedAt');
    });

    it('should handle null values for optional fields', () => {
      const userData = {
        id: 'user-456',
        username: 'anotheruser',
        email: 'another@example.com',
        password: 'hashedpassword',
        displayName: null,
        avatarUrl: null,
        status: UserStatus.OFFLINE,
        lastSeenAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const user = createUserInstance(userData);
      const publicJSON = user.toPublicJSON();

      expect(publicJSON.displayName).toBeNull();
      expect(publicJSON.avatarUrl).toBeNull();
      expect(publicJSON.lastSeenAt).toBeNull();
    });
  });

  describe('toPrivateJSON', () => {
    it('should return all user data except password', () => {
      const createdAt = new Date('2024-01-01T00:00:00Z');
      const updatedAt = new Date('2024-06-01T00:00:00Z');
      const lastSeenAt = new Date('2025-01-01T12:00:00Z');

      const userData = {
        id: 'user-789',
        username: 'privateuser',
        email: 'private@example.com',
        password: 'hashedpassword',
        displayName: 'Private User',
        avatarUrl: 'https://example.com/private-avatar.png',
        status: UserStatus.AWAY,
        lastSeenAt,
        createdAt,
        updatedAt,
      };

      const user = createUserInstance(userData);
      const privateJSON = user.toPrivateJSON();

      expect(privateJSON).toEqual({
        id: 'user-789',
        username: 'privateuser',
        email: 'private@example.com',
        displayName: 'Private User',
        avatarUrl: 'https://example.com/private-avatar.png',
        status: UserStatus.AWAY,
        lastSeenAt,
        createdAt,
        updatedAt,
      });

      expect(privateJSON).not.toHaveProperty('password');
    });

    it('should include email and timestamps that are not in public JSON', () => {
      const userData = {
        id: 'user-101',
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashedpassword',
        displayName: 'Test',
        avatarUrl: null,
        status: UserStatus.ONLINE,
        lastSeenAt: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
      };

      const user = createUserInstance(userData);
      const privateJSON = user.toPrivateJSON();
      const publicJSON = user.toPublicJSON();

      expect(privateJSON).toHaveProperty('email');
      expect(privateJSON).toHaveProperty('createdAt');
      expect(privateJSON).toHaveProperty('updatedAt');

      expect(publicJSON).not.toHaveProperty('email');
      expect(publicJSON).not.toHaveProperty('createdAt');
      expect(publicJSON).not.toHaveProperty('updatedAt');
    });
  });
});
