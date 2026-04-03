import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';
import { Event, EventStatus } from './event.entity';
import { User } from '../users/user.entity';
import { CreateEventDto } from './dto/create-event.dto';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const mockEventRepo = (): MockRepo<Event> => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  remove: jest.fn(),
});

const mockUserRepo = (): MockRepo<User> => ({
  findOne: jest.fn(),
  save: jest.fn(),
});

/** Helper: build a User with events as string[] (per spec) */
const makeUser = (id: number, name = 'Alice', events: string[] = []): User =>
  ({ id, name, events }) as User;

/** Helper: build an Event */
const makeEvent = (overrides: Partial<Event> = {}): Event =>
  ({
    id: 1,
    title: 'Test Event',
    description: 'desc',
    status: EventStatus.TODO,
    startTime: new Date('2024-01-01T14:00:00Z'),
    endTime: new Date('2024-01-01T15:00:00Z'),
    invitees: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Event;

describe('EventsService', () => {
  let service: EventsService;
  let eventRepo: MockRepo<Event>;
  let userRepo: MockRepo<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useFactory: mockEventRepo },
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    eventRepo = module.get(getRepositoryToken(Event));
    userRepo = module.get(getRepositoryToken(User));
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates and saves an event without invitees', async () => {
      const dto: CreateEventDto = {
        title: 'Stand-up',
        status: EventStatus.TODO,
        startTime: '2024-01-01T09:00:00Z',
        endTime: '2024-01-01T09:30:00Z',
      };
      const built = makeEvent({ title: 'Stand-up', id: 10 });
      eventRepo.create!.mockReturnValue(built);
      eventRepo.save!.mockResolvedValue(built);

      const result = await service.create(dto);

      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Stand-up' }),
      );
      expect(eventRepo.save).toHaveBeenCalledWith(built);
      expect(result).toBe(built);
    });

    it('resolves invitees and updates user.events string array', async () => {
      const user = makeUser(42, 'Bob', []);
      userRepo.findOne!
        .mockResolvedValueOnce(user)   // finding user by id for invitees
        .mockResolvedValueOnce(user);  // finding freshUser to update events

      const dto: CreateEventDto = {
        title: 'Meeting',
        status: EventStatus.IN_PROGRESS,
        startTime: '2024-01-01T10:00:00Z',
        endTime: '2024-01-01T11:00:00Z',
        inviteeIds: [42],
      };

      const built = makeEvent({ id: 7, title: 'Meeting', invitees: [user] });
      eventRepo.create!.mockReturnValue(built);
      eventRepo.save!.mockResolvedValue(built);
      userRepo.save!.mockResolvedValue(user);

      await service.create(dto);

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ events: ['7'] }),
      );
    });

    it('silently skips inviteeId that does not exist in DB', async () => {
      // userRepo.findOne returns null → user not found → skip, no crash
      userRepo.findOne!.mockResolvedValue(null);

      const dto: CreateEventDto = {
        title: 'Ghost Meeting',
        status: EventStatus.TODO,
        startTime: '2024-01-01T10:00:00Z',
        endTime: '2024-01-01T11:00:00Z',
        inviteeIds: [999],
      };

      const built = makeEvent({ id: 5, invitees: [] });
      eventRepo.create!.mockReturnValue(built);
      eventRepo.save!.mockResolvedValue(built);

      const result = await service.create(dto);

      // Event saved with no invitees, no crash
      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ invitees: [] }),
      );
      expect(result).toBe(built);
    });
  });

  // ─── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns event when found', async () => {
      const ev = makeEvent();
      eventRepo.findOne!.mockResolvedValue(ev);

      const result = await service.findOne(1);
      expect(result).toBe(ev);
    });

    it('throws NotFoundException when not found', async () => {
      eventRepo.findOne!.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes event and cleans up user.events strings', async () => {
      const invitee = makeUser(1, 'Alice', ['1', '2']); // has event 1 in string list
      const ev = makeEvent({ id: 1, invitees: [invitee] });
      eventRepo.findOne!.mockResolvedValue(ev);
      userRepo.findOne!.mockResolvedValue(invitee);
      userRepo.save!.mockResolvedValue(invitee);
      eventRepo.remove!.mockResolvedValue(undefined);

      await service.remove(1);

      // user.events should have '1' removed
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ events: ['2'] }),
      );
      expect(eventRepo.remove).toHaveBeenCalledWith(ev);
    });

    it('throws NotFoundException if event does not exist', async () => {
      eventRepo.findOne!.mockResolvedValue(null);
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── mergeAll ──────────────────────────────────────────────────────────────

  describe('mergeAll', () => {
    it('throws NotFoundException when user not found', async () => {
      userRepo.findOne!.mockResolvedValue(null);
      await expect(service.mergeAll(999)).rejects.toThrow(NotFoundException);
    });

    it('returns empty array when user has no events', async () => {
      // User.events is an empty string array
      const user = makeUser(1, 'Alice', []);
      userRepo.findOne!.mockResolvedValue(user);

      const result = await service.mergeAll(1);
      expect(result).toEqual([]);
    });

    it('returns events unchanged when none overlap', async () => {
      const user = makeUser(1, 'Alice', ['1', '2']);
      const e1 = makeEvent({
        id: 1,
        startTime: new Date('2024-01-01T09:00:00Z'),
        endTime: new Date('2024-01-01T10:00:00Z'),
      });
      const e2 = makeEvent({
        id: 2,
        startTime: new Date('2024-01-01T11:00:00Z'),
        endTime: new Date('2024-01-01T12:00:00Z'),
      });

      userRepo.findOne!.mockResolvedValue(user);
      eventRepo.find!
        .mockResolvedValueOnce([e1, e2])   // 1st call: load user's events
        .mockResolvedValueOnce([e1, e2]);  // 2nd call: reload fresh results
      userRepo.save!.mockResolvedValue(user);

      const result = await service.mergeAll(1);

      expect(eventRepo.remove).not.toHaveBeenCalled();
      expect(result).toEqual([e1, e2]);
      // user.events updated to same IDs as strings
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ events: ['1', '2'] }),
      );
    });

    it('merges two overlapping events and updates user.events strings', async () => {
      const userA = makeUser(10, 'Alice', ['1', '2']);
      const userB = makeUser(20, 'Bob', ['1', '2']);

      const e1 = makeEvent({
        id: 1,
        title: 'E1',
        description: 'desc1',
        status: EventStatus.TODO,
        startTime: new Date('2024-01-01T14:00:00Z'),
        endTime: new Date('2024-01-01T15:00:00Z'),
        invitees: [userA],
      });
      const e2 = makeEvent({
        id: 2,
        title: 'E2',
        description: 'desc2',
        status: EventStatus.IN_PROGRESS,
        startTime: new Date('2024-01-01T14:45:00Z'),
        endTime: new Date('2024-01-01T16:00:00Z'),
        invitees: [userB],
      });

      const mergedEvent = makeEvent({
        id: 99,
        title: 'E1 | E2',
        description: 'desc1 | desc2',
        status: EventStatus.IN_PROGRESS,
        startTime: new Date('2024-01-01T14:00:00Z'),
        endTime: new Date('2024-01-01T16:00:00Z'),
        invitees: [userA, userB],
      });

      userRepo.findOne!.mockResolvedValue(userA);
      eventRepo.find!
        .mockResolvedValueOnce([e1, e2])      // 1st call: load user's events
        .mockResolvedValueOnce([mergedEvent]); // 2nd call: reload fresh results at end
      eventRepo.remove!.mockResolvedValue(undefined);
      eventRepo.create!.mockReturnValue(mergedEvent);
      eventRepo.save!.mockResolvedValue(mergedEvent);
      userRepo.save!.mockResolvedValue(userA);

      const result = await service.mergeAll(10);

      expect(eventRepo.remove).toHaveBeenCalledWith([e1, e2]);
      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'E1 | E2',
          status: EventStatus.IN_PROGRESS,
        }),
      );
      // user.events should now be the merged event's ID as string
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ events: ['99'] }),
      );
      expect(result).toEqual([mergedEvent]);
    });

    it('merges 3 chain-overlapping events into one', async () => {
      // E1: 9-11, E2: 10-12, E3: 11:30-13 → all chain-overlap → one merged event
      const user = makeUser(1, 'Alice', ['1', '2', '3']);
      const e1 = makeEvent({ id: 1, title: 'E1', status: EventStatus.TODO,
        startTime: new Date('2024-01-01T09:00:00Z'), endTime: new Date('2024-01-01T11:00:00Z'), invitees: [] });
      const e2 = makeEvent({ id: 2, title: 'E2', status: EventStatus.TODO,
        startTime: new Date('2024-01-01T10:00:00Z'), endTime: new Date('2024-01-01T12:00:00Z'), invitees: [] });
      const e3 = makeEvent({ id: 3, title: 'E3', status: EventStatus.TODO,
        startTime: new Date('2024-01-01T11:30:00Z'), endTime: new Date('2024-01-01T13:00:00Z'), invitees: [] });
      const merged = makeEvent({ id: 99, title: 'E1 | E2 | E3', status: EventStatus.TODO,
        startTime: new Date('2024-01-01T09:00:00Z'), endTime: new Date('2024-01-01T13:00:00Z'), invitees: [] });

      userRepo.findOne!.mockResolvedValue(user);
      eventRepo.find!
        .mockResolvedValueOnce([e1, e2, e3])
        .mockResolvedValueOnce([merged]);
      eventRepo.remove!.mockResolvedValue(undefined);
      eventRepo.create!.mockReturnValue(merged);
      eventRepo.save!.mockResolvedValue(merged);
      userRepo.save!.mockResolvedValue(user);

      const result = await service.mergeAll(1);

      // All 3 events removed in one call
      expect(eventRepo.remove).toHaveBeenCalledWith([e1, e2, e3]);
      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'E1 | E2 | E3' }),
      );
      expect(result).toEqual([merged]);
    });

    it('syncs other invitees user.events when merging (Bob scenario)', async () => {
      // Alice and Bob both invited to E2 → mergeAll(Alice) should update Bob.events too
      const alice = makeUser(1, 'Alice', ['1', '2']);
      const bob   = makeUser(2, 'Bob',   ['2']);

      const e1 = makeEvent({ id: 1, title: 'E1', status: EventStatus.TODO,
        startTime: new Date('2024-01-01T14:00:00Z'), endTime: new Date('2024-01-01T15:00:00Z'),
        invitees: [alice] });
      const e2 = makeEvent({ id: 2, title: 'E2', status: EventStatus.TODO,
        startTime: new Date('2024-01-01T14:30:00Z'), endTime: new Date('2024-01-01T16:00:00Z'),
        invitees: [alice, bob] }); // Bob is also in E2

      const merged = makeEvent({ id: 99, title: 'E1 | E2', status: EventStatus.TODO,
        startTime: new Date('2024-01-01T14:00:00Z'), endTime: new Date('2024-01-01T16:00:00Z'),
        invitees: [alice, bob] });

      userRepo.findOne!
        .mockResolvedValueOnce(alice)  // load alice for mergeAll
        .mockResolvedValueOnce(bob);   // load bob to sync his user.events
      eventRepo.find!
        .mockResolvedValueOnce([e1, e2])
        .mockResolvedValueOnce([merged]);
      eventRepo.remove!.mockResolvedValue(undefined);
      eventRepo.create!.mockReturnValue(merged);
      eventRepo.save!.mockResolvedValue(merged);
      userRepo.save!.mockResolvedValue(alice);

      await service.mergeAll(1);

      // Bob's user.events should have '2' replaced by '99'
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2, events: expect.arrayContaining(['99']) }),
      );
    });

    it('picks highest status when merging (COMPLETED wins)', async () => {
      const user = makeUser(1, 'Alice', ['1', '2']);
      const e1 = makeEvent({
        id: 1, title: 'A', status: EventStatus.COMPLETED,
        startTime: new Date('2024-01-01T10:00:00Z'),
        endTime: new Date('2024-01-01T11:00:00Z'),
        invitees: [],
      });
      const e2 = makeEvent({
        id: 2, title: 'B', status: EventStatus.TODO,
        startTime: new Date('2024-01-01T10:30:00Z'),
        endTime: new Date('2024-01-01T12:00:00Z'),
        invitees: [],
      });
      const merged = makeEvent({ id: 99, title: 'A | B', status: EventStatus.COMPLETED });

      userRepo.findOne!.mockResolvedValue(user);
      eventRepo.find!
        .mockResolvedValueOnce([e1, e2])  // 1st call: load user's events
        .mockResolvedValueOnce([merged]); // 2nd call: reload fresh results
      eventRepo.remove!.mockResolvedValue(undefined);
      eventRepo.create!.mockReturnValue(merged);
      eventRepo.save!.mockResolvedValue(merged);
      userRepo.save!.mockResolvedValue(user);

      await service.mergeAll(1);

      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: EventStatus.COMPLETED }),
      );
    });
  });
});
