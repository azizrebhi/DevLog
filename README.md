# DevLog 📝

A personal developer productivity API for tracking your daily coding sessions, analyzing patterns, and getting automated weekly summaries.

## What is DevLog?

DevLog helps developers track their daily work by logging coding sessions with details about what they worked on, how long it took, what they learned, and what blocked them. The system automatically generates weekly summaries showing your most productive projects and common blockers.

This is a real backend system demonstrating production-ready FastAPI development with authentication, background jobs, scheduled tasks, and proper database design.

---

## Features

### ✅ Implemented (Phase 1-4)

- **Session Management** (Full CRUD)
  - Create, read, update (PUT & PATCH), and delete coding sessions
  - Session status tracking (`active`, `DRAFT`, `completed`)
  - Filter sessions by project name and duration range
  - Cursor-based pagination for efficient data retrieval
  - Draft sessions endpoint (`GET /sessions/drafts`)
  
- **Authentication & Authorization**
  - User registration and login with JWT tokens
  - Protected endpoints — users can only access their own data
  - Secure password hashing with bcrypt

- **Weekly Summaries** (Background Jobs)
  - Automated weekly summary generation via Celery Beat
  - Runs every Sunday at midnight UTC
  - Calculates: total sessions, total minutes, top project, most common blocker
  - Manual trigger endpoint (`POST /summary/trigger`)
  - Persisted to database for historical tracking

- **GitHub Webhook Integration**
  - Auto-creates sessions from GitHub push events
  - Matches users by commit author or pusher email
  - Extracts repo name, commit messages, and files changed
  - Estimates session duration (15 min per commit)

- **Docker & Infrastructure**
  - Full Docker Compose setup (5 services)
  - Async Alembic migrations (run inside Docker)
  - Hot-reload development with volume mounts

- **RESTful API**
  - Intuitive endpoint design
  - Pydantic v2 validation for all inputs
  - Automatic API documentation with Swagger UI

### 🚧 Coming Soon

- Redis caching for weekly summaries (Phase 5)
- Request logging and rate limiting (Phase 6)
- Full-text search (Phase 7)
- Semantic search with pgvector (Phase 8)
- MCP server integration (Phase 9)
- CI/CD and production deployment (Phase 10)

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Framework** | FastAPI (async Python web framework) |
| **Database** | PostgreSQL 16 with asyncpg |
| **Migrations** | Alembic |
| **Background Jobs** | Celery with Redis broker |
| **Task Scheduler** | Celery Beat |
| **Authentication** | JWT tokens with python-jose |
| **Validation** | Pydantic v2 |
| **Container** | Docker & Docker Compose |
| **Package Manager** | uv (ultra-fast Python package manager) |

---

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   Client    │─────▶│  FastAPI API │─────▶│  PostgreSQL  │
│  (HTTP/JSON)│      │   (port 8000)│      │  (port 5432) │
└─────────────┘      └──────────────┘      └──────────────┘
                            │
                            │
                     ┌──────▼──────┐
                     │    Redis    │
                     │ (port 6379) │
                     └──────┬──────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
       ┌──────▼──────┐           ┌───────▼──────┐
       │Celery Worker│           │ Celery Beat  │
       │(Tasks exec) │           │  (Scheduler) │
       └─────────────┘           └──────────────┘
```

---

## Quick Start with Docker Compose

### Prerequisites

- Docker and Docker Compose installed
- Git (to clone the repository)

### Setup & Run

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd Future
   ```

2. **Start all services**
   ```bash
   docker-compose up -d
   ```
   
   This starts:
   - PostgreSQL database
   - Redis (message broker)
   - FastAPI API server
   - Celery worker (background tasks)
   - Celery beat (task scheduler)

3. **Run database migrations**
   ```bash
   docker-compose exec api uv run alembic upgrade head
   ```

4. **Access the API**
   - API: http://localhost:8000
   - Interactive docs: http://localhost:8000/docs
   - Alternative docs: http://localhost:8000/redoc

### Verify Installation

Check that all containers are running:
```bash
docker-compose ps
```

You should see 5 services as "Up".

View logs:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f celery_worker
```

---

## API Usage

### 1. Register a User

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dev@example.com",
    "password": "securepass123"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=dev@example.com&password=securepass123"
```

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### 3. Log a Coding Session

```bash
curl -X POST http://localhost:8000/sessions/ \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "project": "DevLog API",
    "worked_on": "Implemented weekly summary generation",
    "duration": "120",
    "what_learned": "Celery Beat scheduling and task design",
    "blockers": "Docker networking configuration"
  }'
```

### 4. Get Your Sessions

```bash
# All sessions (paginated)
curl http://localhost:8000/sessions/ \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Filter by project
curl "http://localhost:8000/sessions/?project=DevLog" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Filter by duration
curl "http://localhost:8000/sessions/?duration_min=60&duration_max=180" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 5. Get Weekly Summaries

```bash
curl http://localhost:8000/summary/ \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Response:
```json
[
  {
    "id": "uuid-here",
    "user_id": "uuid-here",
    "week_start": "2026-04-07T00:00:00Z",
    "total_sessions": 5,
    "total_minutes": 420,
    "top_project": "DevLog API",
    "most_common_blocker": "Docker networking",
    "created_at": "2026-04-14T00:00:00Z"
  }
]
```

---

## API Endpoints

### Authentication
- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login and get JWT token
- `GET /auth/me` - Get current user info

### Sessions
- `POST /sessions/` - Create a new session
- `GET /sessions/` - List sessions (with filters & pagination)
- `GET /sessions/drafts` - Get all draft sessions
- `GET /sessions/{id}` - Get a specific session
- `PUT /sessions/{id}` - Full update a session
- `PATCH /sessions/{id}` - Partial update a session
- `DELETE /sessions/{id}` - Delete a session

### Summaries
- `GET /summary/` - Get your weekly summaries (latest first)
- `GET /summary/latest` - Get most recent weekly summary
- `POST /summary/trigger` - Manually trigger summary generation

### Webhooks
- `POST /webhooks/github` - GitHub push event webhook (auto-creates sessions)

---

## Development

### Running Locally (Without Docker)

1. **Install dependencies**
   ```bash
   uv sync
   ```

2. **Start PostgreSQL and Redis**
   ```bash
   docker-compose up -d postgres redis
   ```

3. **Set environment variables** (create `.env`)
   ```env
   DATABASE_URL=postgresql+asyncpg://devlog:devlog123@localhost:5432/devlog
   postgres_url=postgresql+asyncpg://devlog:devlog123@localhost:5432/devlog
   REDIS_URL=redis://localhost:6379/0
   SECRET_KEY=your-secret-key-change-in-production
   ```

4. **Run migrations**
   ```bash
   uv run alembic upgrade head
   ```

5. **Start the API**
   ```bash
   uv run uvicorn main:app --reload
   ```

6. **Start Celery worker** (in another terminal)
   ```bash
   uv run celery -A app.celery_app worker --pool=solo
   ```

7. **Start Celery beat** (in another terminal)
   ```bash
   uv run celery -A app.celery_app beat
   ```

### Database Operations

**Create a migration** (run inside Docker to avoid Windows networking issues):
```bash
docker exec -it devlog_celery_worker uv run alembic revision --autogenerate -m "description"
```

**Apply migrations:**
```bash
docker exec -it devlog_celery_worker uv run alembic upgrade head
```

**Rollback one migration:**
```bash
docker exec -it devlog_celery_worker uv run alembic downgrade -1
```

**Access PostgreSQL:**
```bash
docker-compose exec postgres psql -U devlog -d devlog
```

**Run SQL query:**
```bash
docker-compose exec postgres psql -U devlog -d devlog -c "SELECT * FROM sessions LIMIT 5;"
```

### Stopping Services

```bash
# Stop all containers
docker-compose down

# Stop and remove volumes (DELETES ALL DATA)
docker-compose down -v
```

---

## Database Schema

### Users Table
- `id` (UUID, primary key)
- `email` (string, unique, indexed)
- `password_hash` (string)
- `created_at` (timestamp with timezone)

### Sessions Table
- `id` (UUID, primary key)
- `user_id` (UUID, foreign key → users)
- `project` (string)
- `worked_on` (string)
- `duration` (string)
- `what_learned` (string)
- `blockers` (string)
- `status` (string, default: "active" — e.g. `active`, `DRAFT`, `completed`)
- `date` (timestamp with timezone, indexed)
- `updated_at` (timestamp with timezone)

### Weekly Summaries Table
- `id` (UUID, primary key)
- `user_id` (UUID, foreign key → users)
- `week_start` (timestamp with timezone)
- `total_sessions` (integer)
- `total_minutes` (integer)
- `top_project` (string, nullable)
- `most_common_blocker` (string, nullable)
- `created_at` (timestamp with timezone)

---

## Project Roadmap

### Current State: Phase 4+ Complete ✅

DevLog supports full session CRUD (including PUT/PATCH), draft sessions, user authentication, filtering/pagination, automated weekly summaries via Celery Beat, and GitHub webhook integration for auto-tracking push activity. Fully Dockerized with async Alembic migrations.

### Next Steps

1. **Phase 5: Caching** — Redis cache for weekly summaries with TTL
2. **Phase 6: Observability** — Request tracing, logging middleware, rate limiting
3. **Phase 7: Search** — PostgreSQL full-text search across sessions
4. **Phase 8: AI Layer** — Semantic search with pgvector and LLM summarization
5. **Phase 9: MCP Integration** — Expose as MCP server for Claude/Copilot
6. **Phase 10: Production** — CI/CD, testing, deployment to Railway/Fly.io

---

## Troubleshooting

### Containers won't start
```bash
docker-compose logs api
docker-compose logs celery_worker
```

### Database connection errors
- Verify postgres container is healthy: `docker-compose ps`
- Check environment variables match in all services

### Port already in use
```bash
# Find what's using port 8000
lsof -i :8000  # Mac/Linux
netstat -ano | findstr :8000  # Windows

# Change port in docker-compose.yml if needed
ports:
  - "8001:8000"  # Use host port 8001 instead
```

### Celery tasks not running
```bash
# Check worker status
docker-compose exec celery_worker celery -A app.celery_app inspect active

# Check beat schedule
docker-compose logs celery_beat
```

---

## License

This project is for educational purposes. Feel free to use it as a learning resource or template for your own projects.

---

## Author

Built as a comprehensive backend learning project demonstrating FastAPI, Celery, Docker, PostgreSQL, and modern Python development practices.
