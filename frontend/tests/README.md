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

### Run all E2E tests (headless, parallel by default):
```bash
cd frontend
npm run test:e2e
```

### Run tests sequentially (slower but avoids file descriptor issues):
```bash
cd frontend
npm run test:e2e:sequential
```

### Run tests with visible browser (headed mode):
```bash
cd frontend
npm run test:e2e:headed
```

### Run tests in UI mode (interactive):
```bash
cd frontend
npm run test:e2e:ui
```

### Run tests in debug mode (headed + step through):
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

## Logging

Each E2E test writes detailed logs to `frontend/tests/logs/e2e/<test-name>.log`. These logs include:
- Backend server startup and configuration
- API requests and responses
- Authentication attempts and results
- Error details with full context
- Backend stderr output (including warnings from Rust test helpers)

The Rust binary's stderr output (including warnings from test helpers) is captured in these log files, keeping the console output clean.

To view logs for a specific test:
```bash
cat frontend/tests/logs/e2e/<test-name>.log
```

## Troubleshooting

### Tests fail to start backend server
- Make sure PostgreSQL and Redis are running
- Check that the `spawn_test_server` binary builds: `cargo build --bin spawn_test_server --features e2e-tests --release`
- Check the test log file for detailed error messages

### Tests timeout
- Increase timeout in `playwright.config.ts` if needed
- Check that ports 3000 and the backend port are available
- Review the test log file for timing issues

### Frontend server doesn't start
- Make sure no other process is using port 3000
- Check that Vite dependencies are installed: `npm install`
- Check the test log file for Vite startup errors

### EMFILE: too many open files error
- Tests run in parallel by default for speed, but this can cause file descriptor exhaustion
- If you encounter this error, run tests sequentially:
  ```bash
  npm run test:e2e:sequential
  ```
- Or increase the file descriptor limit:
  ```bash
  ulimit -n 4096  # Linux/Mac
  ```
- Each test spawns its own Vite dev server, which creates file watchers. Sequential execution ensures proper cleanup between tests.

### Debugging test failures
1. Check the test-specific log file in `frontend/tests/logs/e2e/`
2. Look for `[ERROR]` entries in the log
3. Review the Playwright HTML report: `npm run test:e2e` then open `frontend/playwright-report/index.html`
4. Check backend logs in `tests/logs/` (separate from E2E logs)
