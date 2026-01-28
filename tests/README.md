# Banxway Backend Test Suite

Comprehensive test coverage for CRM integration and core features.

## Test Structure

```
tests/
├── unit/                    # Unit tests (fast, isolated)
│   ├── services/
│   │   └── crm.service.test.ts
│   └── repositories/
│       └── quotation.repository.test.ts
├── integration/             # Integration tests (database required)
│   └── api/
│       └── customers/
│           └── customers.test.ts
├── e2e/                     # End-to-end tests (full stack)
│   └── quotation-to-shipment.test.ts
└── setup.ts                 # Global test configuration
```

## Running Tests

### All Tests
```bash
npm test
```

### By Suite
```bash
# Unit tests only (fast, no database)
npm test -- --selectProjects=unit

# Integration tests only (requires database)
npm test -- --selectProjects=integration

# E2E tests only (full stack)
npm test -- --selectProjects=e2e
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

## Test Coverage

### CRM Service (Unit Tests)
**File:** `tests/unit/services/crm.service.test.ts`

**Coverage:**
- ✅ `getCustomers()` - List with filters and pagination
- ✅ `getCustomerById()` - Retrieve single customer
- ✅ `createCustomer()` - Create with validation
- ✅ `updateCustomer()` - Update with duplicate checks
- ✅ `convertLeadToCustomer()` - Lead conversion
- ✅ `deleteCustomer()` - Deletion with verification
- ✅ `getCustomerContacts()` - Fetch contacts
- ✅ `createContact()` - Create contact with validation

**Test Scenarios:**
- Happy path for all CRUD operations
- Error handling (CustomerNotFoundError, DuplicateCustomerError, CrmError)
- Validation (missing required fields, invalid email, invalid GST)
- Edge cases (empty results, lead conversion rules)

### Customer API (Integration Tests)
**File:** `tests/integration/api/customers/customers.test.ts`

**Coverage:**
- ✅ `POST /api/v1/customers` - Create customer
- ✅ `GET /api/v1/customers` - List with filters
- ✅ `GET /api/v1/customers/:id` - Get single
- ✅ `PATCH /api/v1/customers/:id` - Update
- ✅ `DELETE /api/v1/customers/:id` - Delete
- ✅ `POST /api/v1/customers/:id/convert` - Convert lead
- ✅ `POST /api/v1/customers/:id/contacts` - Create contact
- ✅ `GET /api/v1/customers/:id/contacts` - List contacts

**Test Scenarios:**
- Full request-response cycle for all endpoints
- Status code validation (200, 201, 204, 400, 404, 409)
- Filter and pagination support
- Duplicate detection (email, GST number)
- Contact management for customers
- Lead conversion workflow

## Prerequisites

### Environment Setup
Create `.env.test` with test database credentials:

```bash
# Supabase Test Database
SUPABASE_URL=https://your-test-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-test-service-role-key

# Test environment
NODE_ENV=test
```

### Database Setup
Integration tests require database tables to exist:

```bash
# Run migrations on test database
DATABASE_URL="postgresql://..." node migrate-all.js
```

## Writing New Tests

### Unit Test Template
```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { YourService } from '../../../src/services/your.service';

// Mock dependencies
jest.mock('../../../src/database/repositories/your.repository');

describe('YourService', () => {
  let service: YourService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new YourService();
  });

  describe('yourMethod', () => {
    it('should do something', async () => {
      // Arrange
      const mockData = { id: '1', name: 'Test' };

      // Act
      const result = await service.yourMethod();

      // Assert
      expect(result).toEqual(mockData);
    });
  });
});
```

### Integration Test Template
```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import yourRoutes from '../../../../src/api/v1/your-routes';

describe('Your API Integration Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/your-route', yourRoutes);
  });

  it('should handle request', async () => {
    const response = await request(app)
      .get('/api/v1/your-route')
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
```

## Best Practices

### Do's ✅
- Write tests before implementation (TDD)
- Test both happy path and error cases
- Use descriptive test names
- Mock external dependencies in unit tests
- Clean up test data in integration tests
- Use `beforeEach` for setup, `afterAll` for cleanup
- Test business logic, not implementation details

### Don'ts ❌
- Don't test framework/library code
- Don't use production database for tests
- Don't leave test data in database
- Don't skip error case testing
- Don't mock everything (integration tests need real dependencies)
- Don't write tests without assertions

## Continuous Integration

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Manual workflow dispatch

**CI Commands:**
```bash
# In CI pipeline
npm install
npm run type-check
npm run lint
npm test -- --coverage
```

## Troubleshooting

### "Table does not exist" errors
**Solution:** Run migrations on test database

```bash
DATABASE_URL="your-test-db" node migrate-all.js
```

### "Connection timeout" errors
**Solution:** Check database credentials in `.env.test`

### "Module not found" errors
**Solution:** Clear Jest cache

```bash
npx jest --clearCache
npm test
```

### Mock not working
**Solution:** Ensure mock is defined before imports

```typescript
// Mock BEFORE importing the module that uses it
jest.mock('../../../src/database/repositories/your.repository');
import { YourService } from '../../../src/services/your.service';
```

## Test Metrics

**Target Coverage:**
- Line Coverage: >80%
- Branch Coverage: >75%
- Function Coverage: >85%

**Current Coverage:**
- CRM Service: ~95%
- Customer API: ~90%

## Related Documentation

- **Test Setup:** `tests/setup.ts`
- **Jest Config:** `jest.config.js`
- **Backend Standards:** `CLAUDE.md`

---

**Last Updated:** 2026-01-27
**Maintained By:** Development Team
