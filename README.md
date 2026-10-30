# Azentio.ai — Backend API

Intelligent Collaboration Portal built with FastAPI, MySQL 8.0, SQLAlchemy 2.0, and Pydantic v2.

---

## Prerequisites

- Python 3.12+
- MySQL 8.0 running locally
- PowerShell (Windows)

---

## Setup (PowerShell)

### 1. Create and activate virtual environment

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### 2. Install dependencies

```powershell
pip install -r requirements.txt
```

### 3. Configure environment variables

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set your MySQL root password and a JWT secret:

```
DATABASE_URL=mysql+asyncmy://root:<password>@localhost:3306/azentio_db
JWT_SECRET_KEY=<long-random-secret>
```

### 4. Create the database

Run the provided helper script (reads password from the environment variable
`MYSQL_ROOT_PASSWORD` — never hardcoded):

```powershell
$env:MYSQL_ROOT_PASSWORD = "your_mysql_root_password"
.venv\Scripts\python.exe scripts\create_db.py
```

Or create it manually in the MySQL shell:

```sql
CREATE DATABASE azentio_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. Run Alembic migrations

```powershell
alembic revision --autogenerate -m "initial"
alembic upgrade head
```

### 6. Start the development server

```powershell
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

---

## Running tests

Tests use an in-memory SQLite database — no MySQL required for CI.

```powershell
pytest tests/ -v
```

---

## Project structure

```
app/
  core/
    config.py          # Pydantic settings (loaded from .env)
    security.py        # Argon2 hashing, JWT creation/verification
  db/
    base.py            # SQLAlchemy DeclarativeBase
    session.py         # Async engine and session factory
    types.py           # GUID TypeDecorator (CHAR(36), MySQL/SQLite compatible)
  models/
    user.py
    organisation.py
    membership.py      # RoleEnum + OrganisationMembership
    product.py
  schemas/
    common.py          # SuccessResponse, ErrorResponse, PaginationMeta
    auth.py            # Login, Token, UserOut schemas
  repositories/
    user_repository.py
  services/
    auth_service.py
  api/v1/
    routers/
      auth.py          # POST /login, POST /refresh, GET /me
      health.py        # GET /health
  dependencies/
    auth.py            # get_current_user, require_roles
  main.py              # FastAPI app factory + exception handlers
alembic/               # Migration scripts
scripts/
  create_db.py         # Helper: verify MySQL connection and create database
tests/
  conftest.py          # Fixtures (SQLite in-memory)
  test_health.py
  test_auth.py
```

---

## Phase 4 implementation

The backend includes moderation, explicit publication, organisation product entitlements, shared learning, product improvements, evidence links, and audit retrieval.

- Moderation and publication require moderator or administrator membership.
- Entitlement management requires administrator membership.
- Product improvements require administrator or product-owner membership.
- Consent withdrawal atomically unpublishes associated shared-learning entries.
- Audit listing is restricted to moderators and administrators.

See [docs/phase4_api_documentation.md](docs/phase4_api_documentation.md) for endpoint contracts and authorization rules.

---

## API prefix

All endpoints are under `/api/v1`.

| Method | Path                  | Auth     | Description              |
|--------|-----------------------|----------|--------------------------|
| GET    | /api/v1/health        | None     | Liveness check           |
| POST   | /api/v1/auth/login    | None     | Obtain JWT tokens        |
| POST   | /api/v1/auth/refresh  | None     | Refresh access token     |
| GET    | /api/v1/auth/me       | Bearer   | Current user + roles     |

---

## Response envelope

**Success**
```json
{
  "success": true,
  "message": "Human-readable message",
  "data": {},
  "meta": {}
}
```

**Error**
```json
{
  "success": false,
  "message": "Human-readable error message",
  "error": {
    "code": "ERROR_CODE",
    "details": []
  },
  "meta": {}
}
```

---

## Security notes

- Passwords are hashed with Argon2 — never stored in plaintext.
- JWT secrets are loaded from environment variables only.
- Roles are derived from the database on every request — never trusted from the frontend.
- Generic `401` messages prevent user enumeration.
- All protected endpoints deny access by default.
- Database credentials are never hardcoded — always read from `.env`.

## Frontend integration

See frontend/README.md. The backend layout is preserved at repository root. Use existing Alembic upgrades; do not autogenerate a new initial revision for an existing database. Frontend uses a loopback Vite proxy for /api requests. MySQL credentials and real admin provisioning are not bundled.
