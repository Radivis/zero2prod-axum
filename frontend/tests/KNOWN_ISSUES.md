# Known Issues in Frontend Test Suite

This document tracks known technical debt and areas for improvement in the frontend test infrastructure.

## 1. `loginAsUser` Function Complexity

**Location:** `frontend/tests/helpers.ts`, lines 72-409

**Issue:** The `loginAsUser` function is extremely long (~337 lines) and violates the Single Responsibility Principle. It handles:
- User verification
- Form interaction
- Request/response interception
- Navigation handling
- Multiple error scenarios with extensive logging
- Session cookie verification
- Auth check waiting

**Impact:**
- Difficult to maintain and debug
- Hard to test in isolation
- Increased cognitive load for developers
- Difficult to reuse individual pieces

**Recommended Refactoring:**
Break down into smaller, focused functions:
```typescript
// Suggested structure:
async function verifyUserExists(backendAddress: string, testName: string): Promise<void>
async function navigateToLoginPage(page: Page): Promise<void>
async function fillLoginForm(page: Page, username: string, password: string): Promise<void>
async function submitLoginForm(page: Page): Promise<LoginResponse>
async function waitForLoginNavigation(page: Page): Promise<void>
async function verifyLoginSuccess(page: Page): Promise<void>
async function loginAsUser(page: Page, credentials: LoginCredentials): Promise<void>
```

**Priority:** Medium - Function works correctly but is hard to maintain

**Why Not Fixed in This PR:**
- High risk of breaking existing E2E tests
- Requires comprehensive testing of the refactored components
- Better suited for a dedicated refactoring PR with focused testing

## 2. `startBackendServer` Function Complexity

**Location:** `frontend/tests/fixtures.ts`, lines ~228-436

**Issue:** The `startBackendServer` function is 208 lines long and handles multiple responsibilities:
- Backend process spawning and output capture
- JSON parsing from spawn_test_server stdout
- Health check verification with retries
- User creation via API
- Browser-based login authentication
- Complex error handling and cleanup

**Impact:**
- **Difficult to understand**: Too much logic in one function
- **Hard to test**: Multiple concerns mixed together
- **Maintenance burden**: Changes require understanding entire flow
- **Fragile**: Many moving parts that could break

**Recommended Refactoring:**
Break down into smaller functions:
```typescript
async function parseServerInfoFromOutput(output: string): Promise<ServerInfo>
async function waitForServerInfo(process: ChildProcess, maxWait: number): Promise<ServerInfo>
async function performHealthCheck(address: string): Promise<void>
async function createAndLoginUser(backendApp: TestApp, frontendServer: FrontendServer, page: Page): Promise<void>
async function startBackendServer(testInfo: TestInfo): Promise<TestApp> // Orchestrator
```

**Priority:** Medium - Works correctly but difficult to modify

**Why Not Fixed in This PR:**
- Critical test infrastructure - high risk of breaking all E2E tests
- Requires careful extraction and comprehensive testing
- Should be done as focused refactoring PR with extensive validation

## 3. `spawnTestApp` Function Complexity

**Location:** `frontend/tests/init.ts`, lines ~37-170

**Issue:** The `spawnTestApp` function is 133 lines long and combines:
- Environment variable setup (DATABASE_URL, REDIS_URI, APP_ENVIRONMENT)
- Test server process spawning
- Output parsing with multiple retry/timeout logic paths
- Error handling for various failure modes

**Impact:**
- **Complex control flow**: Multiple nested conditions and loops
- **Difficult to modify**: Changing one part requires understanding the whole
- **Error-prone**: Hard to trace all failure paths
- **Mixed concerns**: Setup, spawning, and parsing interleaved

**Recommended Refactoring:**
Extract helpers:
```typescript
function prepareTestEnvironment(testName: string, config: DatabaseConfig): EnvironmentVars
async function parseBackendOutput(output: string, maxWait: number): Promise<ServerInfo>
async function retryUntil<T>(fn: () => T | null, predicate: (val: T) => boolean, maxWait: number): Promise<T>
async function spawnTestApp(testName: string): Promise<TestApp> // Orchestrator
```

**Priority:** Medium - Works but could be clearer

**Why Not Fixed in This PR:**
- Critical test infrastructure function
- High risk of subtle breakage in test setup
- Should be done with dedicated testing and validation

## 4. Timeout Constants Coverage

**Location:** `frontend/tests/constants.ts`

**Issue:** While timeout constants have been extracted and centralized, there may still be some hardcoded timeouts in less-used helper functions or edge cases.

**Recommended Action:**
- Periodic audit of test files for hardcoded timeout values
- Consider adding a linting rule to detect magic numbers in test files

**Priority:** Low

## 5. Error Handling Patterns

**Location:** Throughout `helpers.ts` and `fixtures.ts`

**Issue:** Error handling is comprehensive but could benefit from more consistent patterns:
- Some errors throw immediately
- Some errors include extensive context logging
- Some errors attempt recovery before throwing

**Recommended Action:**
- Define consistent error handling strategies for different error types
- Consider creating custom error classes for test failures vs. environment issues

**Priority:** Low

## Future Improvements

### Test Isolation
- Consider adding cleanup hooks to ensure complete teardown between tests
- Investigate potential race conditions in parallel test execution

### Performance
- Profile test execution time to identify bottlenecks
- Consider caching built binaries or using incremental builds

### Logging
- Implement structured logging with severity levels
- Consider integration with test reporting tools

---

Last Updated: [Date of PR review]
Reviewer: [Name]
