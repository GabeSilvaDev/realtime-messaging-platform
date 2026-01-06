import { UserRepository } from '@/modules/auth/repositories/UserRepository';
import User from '@/shared/database/models/User';

jest.mock('@/shared/database/models/User', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

const mockUser = User as jest.Mocked<typeof User>;

describe('UserRepository', () => {
  let repository: UserRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new UserRepository();
  });

  describe('findById', () => {
    it('should find a user by id', async () => {
      const mockUserData = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      const mockGet = jest.fn().mockReturnValue(mockUserData);
      (mockUser.findByPk as jest.Mock).mockResolvedValue({ get: mockGet });

      const result = await repository.findById('user-123');

      expect(mockUser.findByPk).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(mockUserData);
    });

    it('should return null when user not found', async () => {
      (mockUser.findByPk as jest.Mock).mockResolvedValue(null);

      const result = await repository.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should find a user by email', async () => {
      const mockUserData = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      const mockGet = jest.fn().mockReturnValue(mockUserData);
      (mockUser.findOne as jest.Mock).mockResolvedValue({ get: mockGet });

      const result = await repository.findByEmail('test@example.com');

      expect(mockUser.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(result).toEqual(mockUserData);
    });

    it('should return null when email not found', async () => {
      (mockUser.findOne as jest.Mock).mockResolvedValue(null);

      const result = await repository.findByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('should find a user by username', async () => {
      const mockUserData = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      const mockGet = jest.fn().mockReturnValue(mockUserData);
      (mockUser.findOne as jest.Mock).mockResolvedValue({ get: mockGet });

      const result = await repository.findByUsername('testuser');

      expect(mockUser.findOne).toHaveBeenCalledWith({
        where: { username: 'testuser' },
      });
      expect(result).toEqual(mockUserData);
    });

    it('should return null when username not found', async () => {
      (mockUser.findOne as jest.Mock).mockResolvedValue(null);

      const result = await repository.findByUsername('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const userData = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'hashedpassword123',
        displayName: 'New User',
      };

      const mockCreatedUser = {
        id: 'new-user-id',
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockGet = jest.fn().mockReturnValue(mockCreatedUser);
      (mockUser.create as jest.Mock).mockResolvedValue({ get: mockGet });

      const result = await repository.create(userData);

      expect(mockUser.create).toHaveBeenCalledWith(userData);
      expect(result).toEqual(mockCreatedUser);
    });

    it('should create user without displayName', async () => {
      const userData = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'hashedpassword123',
      };

      const mockCreatedUser = {
        id: 'new-user-id',
        ...userData,
        displayName: null,
      };

      const mockGet = jest.fn().mockReturnValue(mockCreatedUser);
      (mockUser.create as jest.Mock).mockResolvedValue({ get: mockGet });

      const result = await repository.create(userData);

      expect(mockUser.create).toHaveBeenCalledWith(userData);
      expect(result).toEqual(mockCreatedUser);
    });
  });

  describe('updatePassword', () => {
    it('should update user password', async () => {
      (mockUser.update as jest.Mock).mockResolvedValue([1]);

      await repository.updatePassword('user-123', 'newhashedpassword');

      expect(mockUser.update).toHaveBeenCalledWith(
        { password: 'newhashedpassword' },
        { where: { id: 'user-123' } }
      );
    });

    it('should not throw when user not found', async () => {
      (mockUser.update as jest.Mock).mockResolvedValue([0]);

      await expect(repository.updatePassword('non-existent', 'newpassword')).resolves.not.toThrow();
    });
  });
});
