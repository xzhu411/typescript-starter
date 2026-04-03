import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const mockUserRepo = (): MockRepo<User> => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
});

const makeUser = (id: number, name: string, events: string[] = []): User =>
  ({ id, name, events }) as User;

describe('UsersService', () => {
  let service: UsersService;
  let userRepo: MockRepo<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepo = module.get(getRepositoryToken(User));
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a user with empty events array and returns it', async () => {
      const built = makeUser(1, 'Alice', []);
      userRepo.create!.mockReturnValue(built);
      userRepo.save!.mockResolvedValue(built);

      const result = await service.create({ name: 'Alice' });

      expect(userRepo.create).toHaveBeenCalledWith({ name: 'Alice', events: [] });
      expect(userRepo.save).toHaveBeenCalledWith(built);
      expect(result).toBe(built);
    });

    it('returns user with auto-generated id from DB', async () => {
      const saved = makeUser(42, 'Bob', []);
      userRepo.create!.mockReturnValue({ name: 'Bob', events: [] });
      userRepo.save!.mockResolvedValue(saved);

      const result = await service.create({ name: 'Bob' });

      expect(result.id).toBe(42);
      expect(result.name).toBe('Bob');
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all users', async () => {
      const users = [makeUser(1, 'Alice', ['1']), makeUser(2, 'Bob', [])];
      userRepo.find!.mockResolvedValue(users);

      const result = await service.findAll();

      expect(userRepo.find).toHaveBeenCalled();
      expect(result).toEqual(users);
    });

    it('returns empty array when no users exist', async () => {
      userRepo.find!.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });
});
