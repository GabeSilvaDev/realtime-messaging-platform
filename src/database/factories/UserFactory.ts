import User from '../../shared/database/models/User';
import type { UserCreationAttributes } from '../../shared/types/user.types';
import { UserStatus } from '../../shared/types/user.types';

let userCounter = 0;

function generateUserData(overrides: Partial<UserCreationAttributes> = {}): UserCreationAttributes {
  userCounter++;
  const timestamp = Date.now().toString();
  const counter = userCounter.toString();

  return {
    username: `user_${timestamp}_${counter}`,
    email: `user${counter}_${timestamp}@test.com`,
    password: 'hashedPassword123!',
    displayName: `Test User ${counter}`,
    avatarUrl: null,
    status: UserStatus.OFFLINE,
    ...overrides,
  };
}

async function createUser(overrides: Partial<UserCreationAttributes> = {}): Promise<User> {
  const userData = generateUserData(overrides);
  return User.create(userData);
}

async function createUsers(
  count: number,
  overrides: Partial<UserCreationAttributes> = {}
): Promise<User[]> {
  const users: User[] = [];

  for (let i = 0; i < count; i++) {
    const user = await createUser(overrides);
    users.push(user);
  }

  return users;
}

function buildUser(overrides: Partial<UserCreationAttributes> = {}): UserCreationAttributes {
  return generateUserData(overrides);
}

function buildUsers(
  count: number,
  overrides: Partial<UserCreationAttributes> = {}
): UserCreationAttributes[] {
  return Array.from({ length: count }, () => buildUser(overrides));
}

function resetCounter(): void {
  userCounter = 0;
}

const UserFactory = {
  create: createUser,
  createMany: createUsers,
  build: buildUser,
  buildMany: buildUsers,
  resetCounter,
};

export default UserFactory;
export { createUser, createUsers, buildUser, buildUsers, resetCounter };
