import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { EventsModule } from '../src/events/events.module';
import { UsersModule } from '../src/users/users.module';
import { Event, EventStatus } from '../src/events/event.entity';
import { User } from '../src/users/user.entity';

describe('Events API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST ?? 'localhost',
          port: Number(process.env.DB_PORT ?? 5432),
          username: process.env.DB_USERNAME ?? 'postgres',
          password: process.env.DB_PASSWORD ?? 'postgres',
          database: process.env.DB_DATABASE ?? 'events_db_test',
          entities: [Event, User],
          synchronize: true,
          dropSchema: true,
        }),
        EventsModule,
        UsersModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    dataSource = moduleFixture.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await dataSource.query(
      `TRUNCATE TABLE "event_invitees_user", "event", "user" RESTART IDENTITY CASCADE`,
    );
  });

  // ─── POST /users ──────────────────────────────────────────────────────────

  describe('POST /users', () => {
    it('creates a user with empty events string array', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Alice' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Alice');
      // User.events is a list of strings (empty on creation)
      expect(res.body.events).toEqual([]);
    });
  });

  // ─── POST /events ──────────────────────────────────────────────────────────

  describe('POST /events', () => {
    it('creates an event and appends its id to invitee user.events strings', async () => {
      // Create a user first
      const userRes = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Alice' });
      const userId = userRes.body.id;

      // Create event with that user as invitee
      const eventRes = await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'Sprint Planning',
          status: EventStatus.TODO,
          startTime: '2024-03-01T10:00:00Z',
          endTime: '2024-03-01T11:00:00Z',
          inviteeIds: [userId],
        })
        .expect(201);

      const eventId = eventRes.body.id;
      expect(eventRes.body.invitees).toHaveLength(1);
      expect(eventRes.body.invitees[0].name).toBe('Alice');

      // Verify user.events was updated with the new event ID as string
      const usersRes = await request(app.getHttpServer()).get('/users');
      const alice = usersRes.body.find((u: User) => u.id === userId);
      expect(alice.events).toContain(String(eventId));
    });

    it('returns 400 when required fields are missing', () => {
      return request(app.getHttpServer())
        .post('/events')
        .send({ description: 'No title' })
        .expect(400);
    });

    it('returns 400 when status is an invalid enum value', () => {
      return request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'Bad Status',
          status: 'INVALID_STATUS',
          startTime: '2024-03-01T10:00:00Z',
          endTime: '2024-03-01T11:00:00Z',
        })
        .expect(400);
    });

    it('returns 400 when date format is invalid', () => {
      return request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'Bad Date',
          status: EventStatus.TODO,
          startTime: 'not-a-date',
          endTime: '2024-03-01T11:00:00Z',
        })
        .expect(400);
    });
  });

  // ─── GET /events/:id ──────────────────────────────────────────────────────

  describe('GET /events/:id', () => {
    it('returns the event with invitees', async () => {
      const created = await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'Retro',
          status: EventStatus.COMPLETED,
          startTime: '2024-03-01T15:00:00Z',
          endTime: '2024-03-01T16:00:00Z',
        });

      const res = await request(app.getHttpServer())
        .get(`/events/${created.body.id}`)
        .expect(200);

      expect(res.body.title).toBe('Retro');
    });

    it('returns 404 for unknown id', () => {
      return request(app.getHttpServer()).get('/events/99999').expect(404);
    });
  });

  // ─── DELETE /events/:id ───────────────────────────────────────────────────

  describe('DELETE /events/:id', () => {
    it('deletes event and removes its id from invitee user.events', async () => {
      const userRes = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Bob' });
      const userId = userRes.body.id;

      const eventRes = await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'To delete',
          status: EventStatus.TODO,
          startTime: '2024-03-01T08:00:00Z',
          endTime: '2024-03-01T09:00:00Z',
          inviteeIds: [userId],
        });
      const eventId = eventRes.body.id;

      await request(app.getHttpServer())
        .delete(`/events/${eventId}`)
        .expect(204);

      // Verify event is gone
      await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(404);

      // Verify user.events no longer contains this id
      const usersRes = await request(app.getHttpServer()).get('/users');
      const bob = usersRes.body.find((u: User) => u.id === userId);
      expect(bob.events).not.toContain(String(eventId));
    });

    it('returns 404 when deleting non-existent event', () => {
      return request(app.getHttpServer()).delete('/events/99999').expect(404);
    });
  });

  // ─── POST /events/merge-all/:userId ───────────────────────────────────────

  describe('POST /events/merge-all/:userId', () => {
    it('merges overlapping events, updates DB, and updates user.events strings', async () => {
      const userRepo = dataSource.getRepository(User);
      const eventRepo = dataSource.getRepository(Event);

      // Create user (events as empty string array)
      const user = await userRepo.save({ name: 'Alice', events: [] });

      // Create two overlapping events
      const e1 = await eventRepo.save(
        eventRepo.create({
          title: 'E1', description: 'First',
          status: EventStatus.TODO,
          startTime: new Date('2024-03-01T14:00:00Z'),
          endTime: new Date('2024-03-01T15:00:00Z'),
          invitees: [user],
        }),
      );
      const e2 = await eventRepo.save(
        eventRepo.create({
          title: 'E2', description: 'Second',
          status: EventStatus.IN_PROGRESS,
          startTime: new Date('2024-03-01T14:45:00Z'),
          endTime: new Date('2024-03-01T16:00:00Z'),
          invitees: [user],
        }),
      );

      // Set user.events as string array of IDs
      user.events = [String(e1.id), String(e2.id)];
      await userRepo.save(user);

      const res = await request(app.getHttpServer())
        .post(`/events/merge-all/${user.id}`)
        .expect(201);

      // Should return 1 merged event
      expect(res.body).toHaveLength(1);
      const merged = res.body[0];
      expect(merged.title).toBe('E1 | E2');
      expect(merged.status).toBe(EventStatus.IN_PROGRESS);
      expect(new Date(merged.startTime).toISOString()).toBe('2024-03-01T14:00:00.000Z');
      expect(new Date(merged.endTime).toISOString()).toBe('2024-03-01T16:00:00.000Z');

      // Original events deleted from DB
      await expect(eventRepo.findOne({ where: { id: e1.id } })).resolves.toBeNull();
      await expect(eventRepo.findOne({ where: { id: e2.id } })).resolves.toBeNull();

      // user.events string array updated to new merged event ID
      const updatedUser = await userRepo.findOne({ where: { id: user.id } });
      expect(updatedUser!.events).toEqual([String(merged.id)]);
    });

    it('returns 404 for unknown user', () => {
      return request(app.getHttpServer())
        .post('/events/merge-all/99999')
        .expect(404);
    });

    it('returns empty array when user has no events', async () => {
      const userRepo = dataSource.getRepository(User);
      const user = await userRepo.save({ name: 'Empty User', events: [] });

      const res = await request(app.getHttpServer())
        .post(`/events/merge-all/${user.id}`)
        .expect(201);

      expect(res.body).toEqual([]);
    });

    it('preserves non-overlapping events unchanged', async () => {
      const userRepo = dataSource.getRepository(User);
      const eventRepo = dataSource.getRepository(Event);

      const user = await userRepo.save({ name: 'Charlie', events: [] });

      // Two events with NO overlap (9-10, 11-12)
      const e1 = await eventRepo.save(eventRepo.create({
        title: 'Morning', status: EventStatus.TODO,
        startTime: new Date('2024-03-01T09:00:00Z'),
        endTime: new Date('2024-03-01T10:00:00Z'),
        invitees: [user],
      }));
      const e2 = await eventRepo.save(eventRepo.create({
        title: 'Afternoon', status: EventStatus.TODO,
        startTime: new Date('2024-03-01T11:00:00Z'),
        endTime: new Date('2024-03-01T12:00:00Z'),
        invitees: [user],
      }));

      user.events = [String(e1.id), String(e2.id)];
      await userRepo.save(user);

      const res = await request(app.getHttpServer())
        .post(`/events/merge-all/${user.id}`)
        .expect(201);

      // Both events returned unchanged, none deleted
      expect(res.body).toHaveLength(2);
      const titles = res.body.map((e: Event) => e.title);
      expect(titles).toContain('Morning');
      expect(titles).toContain('Afternoon');

      // Both events still exist in DB
      await expect(eventRepo.findOne({ where: { id: e1.id } })).resolves.not.toBeNull();
      await expect(eventRepo.findOne({ where: { id: e2.id } })).resolves.not.toBeNull();
    });

    it('syncs other invitees user.events after merging (Bob scenario)', async () => {
      const userRepo = dataSource.getRepository(User);
      const eventRepo = dataSource.getRepository(Event);

      const alice = await userRepo.save({ name: 'Alice', events: [] });
      const bob   = await userRepo.save({ name: 'Bob',   events: [] });

      // E1: only Alice; E2: Alice + Bob — they overlap
      const e1 = await eventRepo.save(eventRepo.create({
        title: 'E1', status: EventStatus.TODO,
        startTime: new Date('2024-03-01T14:00:00Z'),
        endTime: new Date('2024-03-01T15:00:00Z'),
        invitees: [alice],
      }));
      const e2 = await eventRepo.save(eventRepo.create({
        title: 'E2', status: EventStatus.IN_PROGRESS,
        startTime: new Date('2024-03-01T14:30:00Z'),
        endTime: new Date('2024-03-01T16:00:00Z'),
        invitees: [alice, bob],
      }));

      alice.events = [String(e1.id), String(e2.id)];
      bob.events   = [String(e2.id)];
      await userRepo.save(alice);
      await userRepo.save(bob);

      const res = await request(app.getHttpServer())
        .post(`/events/merge-all/${alice.id}`)
        .expect(201);

      const mergedId = String(res.body[0].id);

      // Alice.events → [mergedId]
      const updatedAlice = await userRepo.findOne({ where: { id: alice.id } });
      expect(updatedAlice!.events).toEqual([mergedId]);

      // Bob.events → old E2 removed, mergedId added
      const updatedBob = await userRepo.findOne({ where: { id: bob.id } });
      expect(updatedBob!.events).not.toContain(String(e2.id));
      expect(updatedBob!.events).toContain(mergedId);
    });
  });
});
