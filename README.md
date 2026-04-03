# NestJS Events Management API

A NestJS application for managing events with PostgreSQL persistence.

---
## 🎬 Watch Demo on Youtube (click the image below)
 
[![Watch the demo](https://img.youtube.com/vi/y4o4HBXYw_Q/maxresdefault.jpg)](https://youtu.be/NHN3rI2yzko)

## Prerequisites

- Node.js >= 20
- npm >= 10
- PostgreSQL >= 14

## Setup

1. **Install dependencies**

```bash
npm install
```

2. **Configure environment**

```bash
cp .env.example .env
```

Edit `.env` with your PostgreSQL credentials:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=events_db
```

3. **Create the database**

```bash
psql -U postgres -c "CREATE DATABASE events_db;"
```

4. **Start the server**

```bash
npm run start:dev
```

check out `http://localhost:3000/api` using swagger UI to observe api.
The server runs at `http://localhost:3000`. Tables are auto-created on first run (`synchronize: true`).

---

## API Reference

### Create Event

```
POST /events
```

**Body:**
```json
{
  "title": "Sprint Planning",
  "description": "Q1 planning session",
  "status": "TODO",
  "startTime": "2024-03-01T10:00:00Z",
  "endTime": "2024-03-01T11:00:00Z",
  "inviteeIds": [1, 2]
}
```

- `status`: `"TODO"` | `"IN_PROGRESS"` | `"COMPLETED"`
- `description` and `inviteeIds` are optional

---

### Get Event by ID

```
GET /events/:id
```

Returns `404` if not found.

---

### Delete Event by ID

```
DELETE /events/:id
```

Returns `204 No Content` on success. Returns `404` if not found.

---

### Merge All Overlapping Events for a User

```
POST /events/merge-all/:userId
```

Finds all events belonging to the user, identifies overlapping intervals, and merges them:

- **title / description**: appended with ` | `
- **status**: highest priority wins (`COMPLETED` > `IN_PROGRESS` > `TODO`)
- **startTime / endTime**: spans the full merged range
- **invitees**: union of all merged events' invitees

Original events are deleted and replaced with the merged event in both the `event` table and the user's event list.

Returns the resulting list of events (merged + non-overlapping).

---

## Running Tests

### Unit Tests (no database required)

```bash
npm test
```

### Unit Tests with coverage

```bash
npm run test:cov
```

### E2E Tests (requires PostgreSQL)

Create a test database first:

```bash
psql -U postgres -c "CREATE DATABASE events_db_test;"
```

Then run:

```bash
npm run test:e2e
```

E2E tests use a separate `events_db_test` database and drop/recreate the schema on each run.

---

## Project Structure

```
src/
├── app.module.ts           # Root module (TypeORM + Config setup)
├── events/
│   ├── dto/
│   │   └── create-event.dto.ts
│   ├── event.entity.ts
│   ├── events.controller.ts
│   ├── events.module.ts
│   ├── events.service.ts
│   └── events.service.spec.ts
└── users/
    ├── user.entity.ts
    └── users.module.ts
test/
└── events.e2e-spec.ts
```
