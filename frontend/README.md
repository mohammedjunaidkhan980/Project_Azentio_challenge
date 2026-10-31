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
