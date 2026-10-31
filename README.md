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

- Observation review and shared-copy publication require moderator membership; portal admin does not imply moderator access.
- Entitlement management requires administrator membership.
- Improvement writes require a product-owner membership in an entitled organisation; client reads are organisation-scoped. Portal admin does not imply owner access.
- Consent withdrawal atomically unpublishes associated shared-learning entries.
- Audit listing is restricted to moderators and administrators.

The running FastAPI /docs endpoint exposes the current API schema. See the explicit catalogue-grant section below for product marketing permissions, which are separate from observation moderation.

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

Real identity flags are now enforced on login/refresh/protected requests. Only active memberships in active organisations grant role permissions. Ordinary employee membership grants no catalogue writes; each employee catalogue action requires an explicit grant. Portal admin does not imply moderator or product-owner permission; those operations require a corresponding membership. Admin audit and entitlement administration remain available. Improvements are scoped to active client/owner organisations and matching product entitlements; staff job titles do not reveal unassigned client work. Product owners require entitlement before creating/changing an idea. This is an interim five-role model: client_admin, publishing grants beyond the catalogue, managed identity/invitations and explicit server workspace context still require implementation. A demo verified flag is not a real identity provider.

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


## Admin user management and catalogue grants

Run `alembic upgrade head` before starting this version. The additive
`catalogue_permission_grants` revision creates only the membership-scoped grant
and audit-linked author fields; it does not reset users, roles, products or passwords.
No publishing rights are automatically seeded. Existing administrators retain draft
creation/editing; publish and unpublish require separate explicit grants.
Employees need independent `products.create`, `products.edit`, `products.publish`
and `products.unpublish` grants. Clients/moderators/owners gain none by job title.
Only an active, verified identity and an active eligible membership in an active
organisation can exercise a grant. The server rereads grants on each request.

Manage user navigates to `/admin/users/:id`; it no longer appends an off-screen
panel. Details show actual identity approval, account state, memberships, roles,
organisation product entitlements and catalogue grants. Account/membership/grant
changes require confirmation and reload server data. Current administrators cannot
remove their own admin membership or deactivate themselves. Email verification
is read-only; no invitation, password-reset or verification workflow is invented.
Entitlements remain organisation-wide, rather than pretending to be user-specific.
Portal administrators legitimately manage users across organisations; ordinary
members cannot call those endpoints. A membership ID must belong to the target user.

Added contracts (all under `/api/v1`, existing success/error envelopes):

| Method/path | Permission and response |
| --- | --- |
| GET `/admin/organisations` | Admin; active `{id,name}` organisations |
| GET `/admin/users/{id}/product-access` | Admin; `{grants,entitlements}` with product names |
| POST `/admin/users/{id}/permissions` | Admin; `{membership_id,permission,is_active}`; grants limited to the four actions above |
| GET `/products/access` | Authenticated; `{create,edit,publish,unpublish}` effective booleans |
| GET `/products/managed` | At least one effective catalogue action; paged published and draft products |
| POST `/products/{id}/publish` | Explicit publish grant; persisted product and audit event |

Existing POST `/products` always creates a draft and rejects `is_published:true`.
Existing PATCH rejects publication flag changes; editing an already published
offering requires both edit and publish. Existing DELETE unpublishes only with
an explicit unpublish grant. Public GET routes still exclude unpublished offerings.
Grant/revoke and product create/edit/publish/unpublish audit writes commit with the
mutation. Revocation and inactive account/membership/organisation checks are server
enforced, including for already issued access tokens.

Local verification (synthetic development data only): backend pytest uses a disposable
SQLite database; live Playwright uses the running Vite → FastAPI → MySQL path.
Provide `AZENTIO_DEMO_CREDENTIALS` privately; never put credentials in this repository.
Run the focused live checks with `npx playwright test --config playwright.live.config.ts
admin-management.spec.ts` from frontend. Then `python -m scripts.check_admin_audit`
from the root performs a read-only MySQL audit/restoration check. Live traces and
videos stay disabled. Browser contract mocks remain separately labelled and do not
prove live integration. Full Challenge 7 scope and production IAM remain incomplete.


## Presentation rehearsal (real UI and MySQL)

The opt-in `frontend/e2e-live/presentation.spec.ts` clicks the running React UI
using real synthetic development accounts. It does not intercept API requests or
seed journey records through direct API calls. It exercises observation creation,
explicit consent, moderator redaction/approval/publication, a second organisation's
approved-only access, evidence-linked improvement/status, withdrawal, Admin Manage
User and the existing preloaded fallback records. `scripts/verify_presentation_records.py`
performs read-only assertions against the loopback development MySQL database after
each lifecycle stage. Do not run this rehearsal with production/customer accounts.

Prepare the private synthetic presentation manifest outside Git, the existing local
React/FastAPI/MySQL stack and preloaded demo records. Set
`AZENTIO_PRESENTATION_CREDENTIALS` to that private manifest. From frontend run:

```
npx playwright test --config playwright.live.config.ts presentation.spec.ts --grep rehearsal
```

Password-free results, HTTP method/path/status evidence and screenshots are saved
under ignored `frontend/.local/presentation-verification/<timestamp>/`. Authentication
traces and videos are disabled; capture waits for the page's data to render. Failed
runs capture screenshots after clearing any password inputs. Do not commit these
local artifacts or the private manifest. The original remains organisation-visible;
this does not claim an author-private draft. The final journey is deliberately
withdrawn; use the separately verified preloaded approved records for a live backup.

A separate, explicitly opt-in fixture repair check (`AZENTIO_PRESENTATION_REPAIR=1`)
restores only the known fictional support client's intended client membership through
the Admin UI. It is not a generic account migration or an automatic permission reset.
`AZENTIO_PRESENTATION_RESUME` optionally points to the local results JSON when resuming
a rehearsal paused after publication and before creating the improvement. Normal runs
create a fresh fictional observation. The full Challenge 7 scope is not implied by
one passing presentation journey.


## Autonomous live website audit

`frontend/e2e-live/website-audit.spec.ts` exercises all seven synthetic demo identities,
visible workspace navigation, public catalogue search/demo enquiries, employee enquiry
status progression, registration approval denial, actual offline/retry behaviour,
forbidden API access, expired access-token rejection, server-ended session handling,
withdrawn-evidence boundaries and browser-console checks. It never intercepts success
responses. `scripts/verify_website_audit.py` reads the loopback MySQL development schema
to verify browser-created enquiries and unverified registrations. The disposable
registration password exists only in memory and is not included in reports.

Set the existing private `AZENTIO_PRESENTATION_CREDENTIALS` manifest and, for the
server-ended disposable-client case, `AZENTIO_DEMO_CREDENTIALS`. Set
`AZENTIO_QA_RUN` to a local artifact subdirectory. Run from frontend:

```
npx playwright test --config playwright.live.config.ts website-audit.spec.ts
```

For the exact document-verification feedback journey, set
`AZENTIO_QA_BUSINESS_CASE=document-verification` and run the presentation rehearsal.
Set `AZENTIO_QA_BUSINESS_RESULT` to its local results JSON before running the business
privacy/republication cases. These cases use only the IDs from that completed real
journey. The feedback's business impact, suggestion and question are recorded in the
supported description field; no unsupported draft, edit, priority or chatbot is invented.
The signed-expired-token fixture deliberately refuses non-loopback/non-development
configuration and can emit only an already-expired credential. Its output is captured
in memory by the negative test; never log or save that output.

Artifacts remain under ignored `.local/` directories. Personal test reports and
screenshots stay local. Do not run mutable admin and session tests concurrently against
the same disposable account. No production users, resets, authentication bypass or
blanket publishing grants are used. Customer workflow text is professional and honest
about unsupported functions; enquiry detail scrolling/focus follows actual server load.
