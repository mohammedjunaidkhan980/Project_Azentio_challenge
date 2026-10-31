# Azentio frontend

React, TypeScript, Vite and Tailwind. Use synthetic data only. Demo mode is an explicit in-memory walkthrough; API mode makes real HTTP calls and never falls back to fixtures.

## Run

From frontend/: npm ci, then npm run dev. Open http://127.0.0.1:5173. The local /api proxy forwards to the existing backend at 127.0.0.1:8000, avoiding a backend CORS change. For approved remote services set VITE_API_BASE_URL including /api/v1 and restart Vite. No passwords/tokens belong in Vite environment variables.

Opening /connect automatically selects real API authentication; the customer login never offers mock authentication. VITE_DATA_MODE=api also sets the initial application mode. Tokens stay in memory; reload requires login. Only the display mode preference is stored in sessionStorage. Registration does not verify identity or grant roles. A verified active backend account and active membership are required by this UI.

## Checks

npm run build; npm run lint; npm test -- --testTimeout=15000. Install Chromium using npx playwright install chromium, then npm run test:e2e:production after building. Contract mocks are test-only, not live integration proof. Backend MySQL setup remains in the root README; do not regenerate an initial migration for an existing migration history.

## Scope

Products/enquiries, organisation observations, explicit consent, review/publication, approved shared copies, product improvements, user administration and audit use existing backend contracts. No optional AI endpoint exists. Author-private drafts, separate consent purposes, invitation/verification lifecycle, granular grants and production readiness require further backend work.

## Verified delivery checks (30 October 2026)

Production build/typecheck and lint passed; 47 unit/component tests and 55 production browser tests passed. Existing root backend suite: 55 passed on disposable in-memory SQLite, with 47 dependency deprecation warnings. Browser API tests use explicitly labelled contract mocks. No MySQL/admin provisioning, browser-to-live-backend integration, restart persistence or live withdrawal SLA is claimed; those checks require the private reachable backend configuration. Backend business logic, requirements and migration files are unchanged.

## Login and developer diagnostics

The customer /connect page contains only sign-in/account controls and professional authentication errors. Backend addresses, environment configuration and fixture explanations belong in this document. A same-origin URL such as http://localhost:5174/api/v1 is valid: Vite forwards /api to FastAPI at 127.0.0.1:8000. The backend exposes /api/v1/auth/login, /auth/me and /auth/register. This local flow needs no CORS middleware; directly calling a different origin would require an approved CORS configuration. In production configure an equivalent reverse proxy or approved HTTPS API origin.

Inspect the frontend local environment (never print credentials) and vite.config.ts when diagnosing connectivity. This checkout has no frontend .env override; the current API base defaults to window.location.origin + /api/v1. For local checks, GET /api/v1/health through the UI origin and GET http://127.0.0.1:8000/api/v1/health directly should both return success. Health alone does not prove database readiness; the real login and MySQL business journey tests do. Never place passwords/JWT signing secrets in Vite variables.

31 October login verification: build/lint and47 component/unit tests passed; real invalid-password401, successful JWT login, offline failure/recovery and sign-out passed; responsive320/768/1440 layouts and axe scans passed. The real MySQL business journey passed after the login update. No backend/schema/client permission changes were required. Browser offline testing is a real network-unavailable case, not a simulated successful authentication. Authenticated browser traces remain disabled; screenshots capture only the empty sign-in page in an ignored directory.

## Login and workspace routing

Normal application startup now defaults to real API mode. The labelled fixture demonstration is an explicit development/test opt-in (VITE_DATA_MODE=demo); it never grants backend access. The production browser fixture suite opts in through its test-only setup. No tokens, passwords, identities or memberships are stored in browser storage; only the non-secret mode preference is remembered.

Protected routes send signed-out users to /connect with an allowlisted internal returnTo. The real /auth/login token response is followed by /auth/me. A single server-confirmed active membership routes immediately; multiple memberships require an explicit organisation/role choice from that response. Supported landing routes: admin /admin/users; employee /employee; client /workspace; moderator /review; product_owner /improvements. Compatible requested deep links are restored, unsafe/external or incompatible return paths fall back to the selected membership's landing route. Switching workspace navigates to that membership's dashboard. /account holds profile and sign-out controls.

Full page reload intentionally discards memory-held credentials and requires a new sign-in, preserving the intended destination. During a live session, the existing client may refresh a rejected access token once using /auth/refresh. Expired refresh credentials return the user to login with a session-ended message. Local sign-out clears credentials/user/workspace immediately; the current backend has no token-revocation/logout endpoint, so previously issued JWTs expire under existing server policy. This change does not claim provider-managed SSO or server revocation.

No active membership displays a restricted account state instead of a fake workspace. Inactive accounts share the generic invalid-credentials response to avoid exposing account status. Inactive organisations are filtered by /auth/me and rejected by server permission checks. Workspace selection is not a permission grant; every API operation still validates server membership/role/product scope.

The employee landing links only to existing authorised operational work and states that additional internal resources are unavailable. It is not a completed internal playground, knowledge library or employee innovation portal. Those requirement gaps remain tracked privately.


## Admin management and delegated catalogue actions

`/admin/users/:id` is an admin-only, routed detail page with actual status,
membership, organisation product-access and catalogue-grant controls. Account,
role, membership and grant changes use confirmed server responses and refresh data.
The UI reads `/products/access` before exposing catalogue controls. Managed offering
selection uses `/products/managed`; there is no manual product-ID entry for normal
create/edit/publish/unpublish actions. Creation is draft-only. Publication and
unpublication have independent grants and explicit confirmations. Editing a live
offering also requires publishing permission. The previous developer warning is
removed; missing rights hide actions or give an appropriate read-only explanation.
The backend remains authoritative, including after a grant is revoked.

Real regression coverage is in `e2e-live/admin-management.spec.ts`; configure the
existing local FastAPI/MySQL stack and private `AZENTIO_DEMO_CREDENTIALS` file.
Backend migration `catalogue_permission_grants` must be applied first. No seed
passwords or production URLs are bundled. Catalogue grants do not implement the
remaining invitation, internal publishing, client-admin or provider-identity scope.
