# QA Practice API - Task Tracker

## What This Is
A Flask API built for practicing API testing with Playwright and Postman. The user is a QA engineer prepping for multiple interviews and wants to sharpen API testing skills.

## Project Structure
```
qa-practice/
├── CLAUDE.md                  # This file
├── app.py                     # Flask API (Python) — the thing being tested
├── playwright.config.js       # Playwright config
├── postman-collection.json    # Importable Postman collection with test scripts
├── tests/
│   └── api.spec.js            # Playwright API tests (26 tests)
├── venv/                      # Python virtual environment (not committed)
└── node_modules/              # Node deps (not committed)
```

## Setup
```bash
# Python
python3 -m venv venv
source venv/bin/activate
pip install flask

# Node
npm init -y
npm install -D @playwright/test
```

## Running
- **API server**: `source venv/bin/activate && python app.py` (runs on http://localhost:5000)
- **Playwright tests**: `npx playwright test` (API must be running first)
- **Postman**: Import `postman-collection.json` into Postman, run Register → Login first to chain auth token

## API Overview
- `GET /api/health` — health check
- `POST /api/auth/register` — register (email, password, name)
- `POST /api/auth/login` — login, returns Bearer token
- `GET /api/tasks` — list tasks (supports ?status=, ?priority=, ?page=, ?per_page=)
- `POST /api/tasks` — create task (requires Bearer token)
- `GET /api/tasks/<id>` — get single task
- `PUT /api/tasks/<id>` — update task (requires Bearer token)
- `DELETE /api/tasks/<id>` — delete task (requires Bearer token)

Valid statuses: todo, in_progress, in_review, done
Valid priorities: low, medium, high, critical

## In-Memory Storage
The API uses in-memory dicts — no database. Restarting the server resets everything. This is intentional for testing.

## Auth Pattern
Register → Login → get token → pass as `Authorization: Bearer <token>` header on POST/PUT/DELETE /tasks endpoints. GET endpoints are public.

## Test Organization (tests/api.spec.js)
Tests are grouped by concern:
1. Health check
2. Auth - Registration (happy path, duplicate email, missing fields, invalid email, short password)
3. Auth - Login (happy path, wrong password, non-existent email, info leak check)
4. Tasks CRUD (create, read, update, delete, auth required, not found)
5. Filtering & pagination (status filter, priority filter, invalid filter, pagination, boundary errors)
6. Edge cases & security (unknown endpoints, wrong HTTP method, invalid token, malformed auth header)

## What the User Wants Help With
- Adding more tests or test scenarios
- Expanding the API with new endpoints to test against
- Practicing specific testing patterns (contract testing, schema validation, performance, etc.)
- Building out an automation framework/roadmap from scratch
- Interview prep for QA roles at: Card Compliant (C#/.NET), Avetta (API testing, QA Lead interview), weavix (startup, building QA from scratch, React Native), Netsmart (healthcare, onsite next Thursday)

## Guidelines
- Keep the API simple — it exists to be tested, not to be production software
- When adding tests, follow the existing pattern: descriptive test names, grouped by feature, test both happy and unhappy paths
- The user is practicing for interviews — frame suggestions in terms of what would impress a QA Lead or hiring manager
- Postman collection should stay in sync if new endpoints are added
- Playwright tests use the `request` API context (no browser needed for API tests)
