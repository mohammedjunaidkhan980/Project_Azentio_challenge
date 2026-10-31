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

### Real local integration verification (31 October 2026)

Verified on an isolated loopback MySQL Community 8.4.13 instance: existing migrations upgraded to `phase4_platform_workflows`; 46 real HTTP assertions and one Chromium browser-to-React-to-FastAPI-to-MySQL journey passed. The journey covers author consent, moderator approval/publication, entitled cross-client approved learning, evidence-linked improvements, client-visible status and withdrawal. Independent SQL checks verified committed consent events, publication/evidence state and audit rows. A clean MySQL shutdown/restart preserved the browser-created record and FastAPI reconnected successfully.

A real test exposed same-tenant non-authors changing consent. Grant and withdrawal now enforce the recorded author on the server; foreign-tenant originals still return 404. Backend regression: 57 tests passed on disposable SQLite (separate evidence from real MySQL checks). Frontend lint/typecheck passed. Existing mock suites and the frontend build were not repeated for this backend-focused change. No production/security certification is implied.

For a fresh **local synthetic development schema only**, configure an ignored private `.env` with `APP_ENV=development`, a random JWT secret and a loopback `mysql+asyncmy` URL pointing to `azentio_dev`. Use a dedicated schema-scoped database account. Apply `python -m alembic upgrade head`, then provision fixtures with:

```powershell
python -m scripts.seed_local_demo --credentials-file <private-directory>/demo-accounts.json
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

The private directory must already exist, be excluded from Git and have restrictive filesystem permissions. Fixtures contain three fictional organisations and random per-account credentials written only to that file. Existing administrators are preserved; accounts/passwords are never reset. An existing unrelated admin is not assigned new credentials. Never run fixtures on customer or production data. This helper intentionally refuses non-loopback databases, other schema names and non-development environments.

With FastAPI running, execute only the real HTTP check:

```powershell
python -m scripts.check_live_journey --credentials-file <private-directory>/demo-accounts.json
```

From `frontend/`, use the existing dependencies or `npm ci`, then run the dedicated real browser test:

```powershell
$env:AZENTIO_DEMO_CREDENTIALS='<private-directory>/demo-accounts.json'
npx playwright test --config playwright.live.config.ts
```

This opt-in suite starts Vite on loopback port 5174 and proxies `/api` to FastAPI on 8000. It has no API mocks and disables traces, screenshots and video to avoid credential capture. Do not run it concurrently against the same fixture file. After the test, `npm run dev -- --port 5174` starts the review UI; open `/connect` to sign in. Credentials, database files, server logs and downloaded MySQL binaries remain local and are not distributed.

### Approved learning search, themes and least privilege

GET /api/v1/shared-learning now accepts optional q (maximum200 characters) and product_id. Search uses only reviewed title/content, treats percent/underscore literally, and applies consent/entitlement filters before counts/pagination. Shared category is null because the original free-text category has no moderation field; legacy source categories are never copied into responses.

GET /api/v1/learning-themes is available to active client/product_owner memberships with relevant product entitlements. It returns deterministic approved-copy groups with title, product_id, distinct_organisations, limitations, method, publication_window_start/end, updated_at and supporting_contributions (approved entry id/title only, capped at20). THEME_MIN_ORGANISATIONS defaults to3 and cannot be lower than3. Sub-threshold groups and their counts are omitted. The window describes publication dates, not source observation dates. No AI, model training or formal privacy guarantee is claimed. Themes are computed from current published, consent-active records with no cache; withdrawal immediately re-evaluates the cohort.

Real identity flags are now enforced on login/refresh/protected requests. Only active memberships in active organisations grant role permissions. Ordinary employee membership cannot edit catalogue content. Portal admin does not imply moderator or product-owner permission; those operations require a corresponding membership. Admin audit and entitlement administration remain available. Improvements are scoped to active client/owner organisations and matching product entitlements; staff job titles do not reveal unassigned client work. Product owners require entitlement before creating/changing an idea. This is an interim five-role model: client_admin, content-publisher grants, managed identity/invitations and explicit server workspace context still require implementation. A demo verified flag is not a real identity provider.

Real MySQL checks (use the private synthetic fixture file; never commit it):

```powershell
python -m scripts.check_role_boundaries --credentials-file <private-directory>/demo-accounts.json
python -m scripts.check_learning_themes --credentials-file <private-directory>/demo-accounts.json
```

Run the real browser suite while the theme cohort is active. Then withdraw only those synthetic theme fixtures with check_learning_themes --credentials-file <private-directory>/demo-accounts.json --cleanup. The role check temporarily toggles synthetic verification/tenant flags and restores their previous values in finally blocks; do not run it concurrently with other demo users. The seed helper now also creates synthetic employee and second-tenant owner accounts without resetting existing accounts. Private reference analysis/status documents are intentionally not part of this shared repository.

Current scoped verification: backend63 testsPASS (disposable SQLite),35 real MySQL role checksPASS,50 real workflow HTTP checksPASS,3 real browser journeysPASS, frontend build/lint/typecheck and47 unit testsPASS. Production browser regression had53 initial passes and2 corrected test expectations/races, then3 targeted cases passed (including one new moderator case); no consolidated56/56 run is claimed. Full feature coverage remains partial: executable sandbox, employee workspace, author-private draft/returned-edit lifecycle, separate consent purposes, invitations/managed identity, report notifications and granular grants require further work.

### Catalogue presentation data

The API catalogue reads MySQL products, not the preview adapter. Local seed presentation copy is maintained in scripts/refresh_catalogue.py and applied by scripts/seed_local_demo.py. Run python -m scripts.refresh_catalogue to refresh only the isolated azentio_dev catalogue. It retains the original financial-analysis product ID/slug and all relationships, upserts three curated offering concepts, and unpublishes known synthetic-theme integration products without deleting them. New theme test products are unpublished from creation and remain unpublished after cleanup. The preview catalogue uses matching descriptions. These are demonstration offering concepts, not a claim of approved released capabilities; scenario data remains fictional.

The customer catalogue header contains business copy only. Catalogue checks verify real MySQL/proxy responses, stable IDs/evidence references, seed idempotence and responsive offering/detail navigation; local screenshots and credentials are excluded from Git.
