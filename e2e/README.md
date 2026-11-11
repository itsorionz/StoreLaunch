# E2E Tests - StoreLaunch

## Overview

End-to-end tests using **Playwright** for browser-based verification of the StoreLaunch application. Tests cover critical user flows across rider, admin, customer, and support roles.

## Test Structure

```
e2e/
├─ README.md              # This file
├─ playwright.config.ts   # Playwright configuration
├─ global-setup.ts       # Test environment setup
├─ global-teardown.ts    # Test environment teardown
├─ auth/                # Authentication tests
│   ├─ login.test.ts
│   └─ logout.test.ts
├─ rider/               # Rider functionality tests
│   ├─ orders/
│   │   └─ list.test.ts
│   └─ profile-route-history.test.ts
├─ admin/               # Admin functionality tests
│   ├─ orders-list.test.ts
│   ├─ order-detail.test.ts
│   ├─ products-list.test.ts
│   ├─ dashboard.test.ts
│   └─ support-tickets.test.ts
├─ warehouse/           # Warehouse operations tests
│   ├─ inventory-management.test.ts
│   ├─ operations.test.ts
│   ├─ receiving-full.test.ts
│   └─ full-operations.test.ts
├─ sales/               # Sales POS tests
│   ├─ pos.tests.ts
│   └─ pos-pipeline.test.ts
├─ marketing/           # Marketing campaign tests
│   ├─ campaigns.tests.ts
│   └─ campaigns-workflow.test.ts
├─ hrm/                 # HRM attendance/payroll tests
│   ├─ attendance-full.test.ts
│   ├─ employees.test.ts
│   ├─ payroll-processing.test.ts
│   └─ self-service.test.ts
├─ support/             # Support agent tests
│   ├─ agent.tests.ts
│   ├─ full-workflow.test.ts
│   ├─ queue-workflow.test.ts
│   └─ ticket-creation.test.ts
├─ customer/            # Customer account tests
│   └─ account-browse.test.ts
└─ store/               # Storefront tests
    └─ account.test.ts
```

## Test Priorities

### Priority 1: Critical Path

- Rider authentication and order list
- Admin login and order list
- Customer account access

### Priority 2: Important

- Rider order detail view
- Admin product list and detail
- Dashboard metrics display
- Support ticket management

### Priority 3: Nice-to-Have

- Proof of delivery recording
- Delivery attempt recording
- Product creation
- Navigation between sections

## Test Accounts

| Role     | Username            | Password      | Notes                      |
| -------- | ------------------- | ------------- | -------------------------- |
| Rider    | `rider@test.com`    | `password123` | Created via seed or exists |
| Admin    | `admin@test.com`    | `admin123`    | Created via seed or exists |
| Customer | `customer@test.com` | `password123` | Created via seed or exists |

## Running Tests

### Installation

```bash
# Install Playwright
npm init playwright@latest

# Or install dependencies
npm install
```

### Run All Tests

```bash
npm run test:e2e
# or
npx playwright test
```

### Run Specific Test File

```bash
npx playwright test e2e/rider/orders/list.test.ts
npx playwright test e2e/admin/orders-list.test.ts
npx playwright test e2e/auth/login.test.ts
```

### Show Test Report

```bash
npx playwright show-report
```

### Run with UI Mode

```bash
npx playwright test --ui
```

### Specific Test Categories

```bash
# Rider tests only
npx playwright test e2e/rider/

# Admin tests only
npx playwright test e2e/admin/

# Warehouse tests only
npx playwright test e2e/warehouse/
```

## Test Configuration

Configuration is in `playwright.config.ts`:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
    navigationTimeout: 20000,
  },
  reporter: [["list"], ["html", { output: "last-result" }]],
  projects: [
    {
      name: "Chromium",
      use: { ...config.use, browser: "chromium" },
    },
    // {
    //   name: 'Firefox',
    //   use: { ...config.use, browser: 'firefox' },
    // },
    // {
    //   name: 'Chrome',
    //   use: { ...config.use, browser: 'chrome' },
    // },
  ],
});
```

## Global Setup/TearDown

- `global-setup.ts`: Creates test data before all tests run (seed database, create test accounts)
- `global-teardown.ts`: Cleans up test data after all tests complete

## Test Conventions

1. **Test Descriptions**: Use `test.describe()` with meaningful names
2. **Test IDs**: Use `data-testid` attributes on key elements
3. **Assertions**: Use `expect()` with descriptive error messages
4. **Fixtures**: Use test fixtures for reusable setup (login, navigation)
5. **Timeouts**: Use proper waits (`await page.waitForSelector()`, `await page.waitForLoadState()`)
6. **Screenshots**: On failure, screenshots are automatically saved to `e2e/test-results/`

## Commands Reference

| Command                      | Description                       |
| ---------------------------- | --------------------------------- |
| `npm run test:e2e`           | Run all E2E tests                 |
| `npx playwright test`        | Run all E2E tests (alias)         |
| `npx playwright test <path>` | Run specific test file/directory  |
| `npx playwright show-report` | Show HTML test report             |
| `npx playwright test --ui`   | Run tests in UI mode              |
| `npx playwright codegen`     | Generate test code by interaction |

## Risks and Mitigation

| Risk                        | Mitigation                                            |
| --------------------------- | ----------------------------------------------------- |
| Tests break after migration | Run tests before and after migration, compare results |
| Test data management        | Use global setup/teardown to create/clean test data   |
| Flaky tests due to timing   | Use `await page.waitForSelector()` and proper waits   |
| Browser compatibility       | Test on Chromium (default), optionally Firefox/Chrome |
| Database dependency         | UI tests, not database-dependent e2e tests            |

## Success Criteria

- [ ] All critical path tests pass (100%)
- [ ] No new ESLint violations introduced
- [ ] TypeScript compilation passes
- [ ] Performance within acceptable limits (<30s average test duration)
- [ ] No security vulnerabilities
- [ ] Test pass rate: 100%
- [ ] False positive rate: 0%

## Implementation Roadmap

### Week 1: Setup

- [ ] Install Playwright
- [ ] Configure playwright.config.ts
- [ ] Create global setup/teardown
- [ ] Add test scripts to package.json

### Week 2: Rider Tests

- [ ] Rider login test
- [ ] Rider order list test
- [ ] Rider order detail test
- [ ] Rider proof test
- [ ] Rider attempt test

### Week 3: Admin Tests

- [ ] Admin login test
- [ ] Admin orders list test
- [ ] Admin order detail test
- [ ] Admin products list test
- [ ] Admin dashboard test

### Week 4: Flow Tests

- [ ] Login/logout flow
- [ ] Navigation between sections
- [ ] Error handling

### Week 5: Validation

- [ ] Run all tests
- [ ] Fix failures
- [ ] Generate report
- [ ] Update documentation

## Next Steps

1. Review existing test files in `e2e/` directory
2. Run existing tests to verify setup: `npx playwright test`
3. Add missing test categories as needed
4. Integrate with CI/CD pipeline
5. Expand coverage based on priority

## Related Documentation

- `PLAYWRIGHT_TEST_PLAN.md` - Detailed test plan with tasks and priorities
- `ARCHITECTURE_OVERVIEW.md` - Clean Architecture migration context
- `e2e/` directory - Contains all test files organized by feature area
