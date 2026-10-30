# Azentio frontend

React, TypeScript, Vite and Tailwind. Use synthetic data only. Demo mode is an explicit in-memory walkthrough; API mode makes real HTTP calls and never falls back to fixtures.

## Run

From frontend/: npm ci, then npm run dev. Open http://127.0.0.1:5173. The local /api proxy forwards to the existing backend at 127.0.0.1:8000, avoiding a backend CORS change. For approved remote services set VITE_API_BASE_URL including /api/v1 and restart Vite. No passwords/tokens belong in Vite environment variables.

API mode can be chosen on /connect or defaulted with VITE_DATA_MODE=api. Tokens stay in memory; reload requires login. Only the display mode preference is stored in sessionStorage. Registration does not verify identity or grant roles. A verified active backend account and active membership are required by this UI.

## Checks

npm run build; npm run lint; npm test -- --testTimeout=15000. Install Chromium using npx playwright install chromium, then npm run test:e2e:production after building. Contract mocks are test-only, not live integration proof. Backend MySQL setup remains in the root README; do not regenerate an initial migration for an existing migration history.

## Scope

Products/enquiries, organisation observations, explicit consent, review/publication, approved shared copies, product improvements, user administration and audit use existing backend contracts. No optional AI endpoint exists. Author-private drafts, separate consent purposes, invitation/verification lifecycle, granular grants and production readiness require further backend work.

## Verified delivery checks (30 October 2026)

Production build/typecheck and lint passed; 47 unit/component tests and 55 production browser tests passed. Existing root backend suite: 55 passed on disposable in-memory SQLite, with 47 dependency deprecation warnings. Browser API tests use explicitly labelled contract mocks. No MySQL/admin provisioning, browser-to-live-backend integration, restart persistence or live withdrawal SLA is claimed; those checks require the private reachable backend configuration. Backend business logic, requirements and migration files are unchanged.
