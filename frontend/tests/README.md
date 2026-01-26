# E2E Tests with Playwright

This directory contains end-to-end tests for the React frontend using Playwright.

## Prerequisites

1. **Install Playwright browsers** (first time only):
   ```bash
   cd frontend
   npx playwright install
   ```

2. **Install dependencies**:
   ```bash
   cd frontend
   npm install
   ```

3. **Ensure backend dependencies are available**:
   - PostgreSQL must be running (same as for integration tests)
   - Redis/Valkey must be running (same as for integration tests)
   - The Rust backend must be buildable

## Running Tests

### Run all E2E tests:
```bash
cd frontend
npm run test:e2e
```

### Run tests in UI mode (interactive):
```bash
cd frontend
npm run test:e2e:ui
```

### Run tests in debug mode:
```bash
cd frontend
npm run test:e2e:debug
```

### Run a specific test file:
```bash
cd frontend
npx playwright test tests/e2e/login.spec.ts
```

## How It Works

1. **Backend Server**: Each test spawns a fresh backend test server using the `spawn_test_server` binary
2. **Frontend Server**: Each test starts a Vite dev server that proxies to the test backend
3. **Browser**: Playwright opens a browser and interacts with the frontend
4. **Cleanup**: After each test, both servers are stopped

## Test Structure

- `tests/helpers.ts` - Helper functions for spawning servers and test utilities
- `tests/fixtures.ts` - Playwright fixtures that set up backend/frontend servers
- `tests/e2e/*.spec.ts` - Individual test files

## Troubleshooting

### Tests fail to start backend server
- Make sure PostgreSQL and Redis are running
- Check that the `spawn_test_server` binary builds: `cargo build --bin spawn_test_server --features e2e-tests --release`

### Tests timeout
- Increase timeout in `playwright.config.ts` if needed
- Check that ports 3000 and the backend port are available

### Frontend server doesn't start
- Make sure no other process is using port 3000
- Check that Vite dependencies are installed: `npm install`
