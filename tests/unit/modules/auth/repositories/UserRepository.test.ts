import { UserRepository } from '@/modules/auth/repositories/UserRepository';
import { sequelize } from '@/shared/database';

jest.mock('@/shared/database', () => ({
  sequelize: {
    models: {
      User: {
        findByPk: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    },
  },
}));

const mockUserModel = sequelize.models.User!;

describe('UserRepository', () => {
  let repository: UserRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new UserRepository();
  });

  describe('findById', () => {
    it('should find a user by id', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      const mockGet = jest.fn().mockReturnValue(mockUser);
      (mockUserModel.findByPk as jest.Mock).mockResolvedValue({ get: mockGet });

      const result = await repository.findById('user-123');

      expect(mockUserModel.findByPk).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      (mockUserModel.findByPk as jest.Mock).mockResolvedValue(null);

      const result = await repository.findById('non-existent-id');

      expect(result).toBeUndefined();
    });

    it('should return null when User model is undefined', async () => {
      const repoWithNoModel = new UserRepository();
      jest
        .spyOn(repoWithNoModel as unknown as { User: unknown }, 'User', 'get')
        .mockReturnValue(undefined);

      const result = await repoWithNoModel.findById('user-123');

      expect(result).toBeUndefined();
    });
  });

  describe('findByEmail', () => {
    it('should find a user by email', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      const mockGet = jest.fn().mockReturnValue(mockUser);
      (mockUserModel.findOne as jest.Mock).mockResolvedValue({ get: mockGet });

      const result = await repository.findByEmail('test@example.com');

      expect(mockUserModel.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when email not found', async () => {
      (mockUserModel.findOne as jest.Mock).mockResolvedValue(null);

      const result = await repository.findByEmail('notfound@example.com');

      expect(result).toBeUndefined();
    });

    it('should return undefined when User model is undefined', async () => {
      const repoWithNoModel = new UserRepository();
      jest
        .spyOn(repoWithNoModel as unknown as { User: unknown }, 'User', 'get')
        .mockReturnValue(undefined);

      const result = await repoWithNoModel.findByEmail('test@example.com');

      expect(result).toBeUndefined();
    });
  });

  describe('findByUsername', () => {
    it('should find a user by username', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      const mockGet = jest.fn().mockReturnValue(mockUser);
      (mockUserModel.findOne as jest.Mock).mockResolvedValue({ get: mockGet });

      const result = await repository.findByUsername('testuser');

      expect(mockUserModel.findOne).toHaveBeenCalledWith({
        where: { username: 'testuser' },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when username not found', async () => {
      (mockUserModel.findOne as jest.Mock).mockResolvedValue(null);

      const result = await repository.findByUsername('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should return undefined when User model is undefined', async () => {
      const repoWithNoModel = new UserRepository();
      jest
        .spyOn(repoWithNoModel as unknown as { User: unknown }, 'User', 'get')
        .mockReturnValue(undefined);

      const result = await repoWithNoModel.findByUsername('testuser');

      expect(result).toBeUndefined();
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
      (mockUserModel.create as jest.Mock).mockResolvedValue({ get: mockGet });

      const result = await repository.create(userData);

      expect(mockUserModel.create).toHaveBeenCalledWith(userData);
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
      (mockUserModel.create as jest.Mock).mockResolvedValue({ get: mockGet });

      const result = await repository.create(userData);

      expect(mockUserModel.create).toHaveBeenCalledWith(userData);
      expect(result).toEqual(mockCreatedUser);
    });

    it('should return undefined when User model is undefined', async () => {
      const repoWithNoModel = new UserRepository();
      jest
        .spyOn(repoWithNoModel as unknown as { User: unknown }, 'User', 'get')
        .mockReturnValue(undefined);

      const userData = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'hashedpassword123',
      };

      const result = await repoWithNoModel.create(userData);

      expect(result).toBeUndefined();
    });
  });

  describe('updatePassword', () => {
    it('should update user password', async () => {
      (mockUserModel.update as jest.Mock).mockResolvedValue([1]);

      await repository.updatePassword('user-123', 'newhashedpassword');

      expect(mockUserModel.update).toHaveBeenCalledWith(
        { password: 'newhashedpassword' },
        { where: { id: 'user-123' } }
      );
    });

    it('should not throw when user not found', async () => {
      (mockUserModel.update as jest.Mock).mockResolvedValue([0]);

      await expect(repository.updatePassword('non-existent', 'newpassword')).resolves.not.toThrow();
    });

    it('should handle undefined User model', async () => {
      const repoWithNoModel = new UserRepository();
      jest
        .spyOn(repoWithNoModel as unknown as { User: unknown }, 'User', 'get')
        .mockReturnValue(undefined);

      await expect(
        repoWithNoModel.updatePassword('user-123', 'newpassword')
      ).resolves.not.toThrow();
    });
  });
});
