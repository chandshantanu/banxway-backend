# Banxway Backend Development Standards

Project-specific guidelines for Claude Code when working on the Banxway backend.

---

## Project Overview

**Name:** Banxway Backend API
**Tech Stack:** Node.js, Express, TypeScript, Supabase (PostgreSQL), Redis (BullMQ)
**Purpose:** REST API for freight forwarding communication hub
**Architecture:** Microservices-ready monolith with worker queues

---

## Table of Contents

1. [Documentation Workflow](#documentation-workflow) ⭐ **NEW**
2. [Error Handling Standards](#error-handling-standards)
3. [Logging Methodology](#logging-methodology)
4. [Database Access Patterns](#database-access-patterns)
5. [API Response Standards](#api-response-standards)
6. [Code Organization](#code-organization)
7. [Testing Strategy](#testing-strategy)
8. [Security Requirements](#security-requirements)
9. [Deployment Process](#deployment-process)

---

## Documentation Workflow

### ⭐ CRITICAL: Keep Documentation Updated

**MANDATORY:** All documentation must be updated whenever code changes are made that affect:
- Database schema
- API endpoints
- Authentication/security
- Error handling patterns
- New features or services
- Configuration changes

### Documentation Files Location

**Backend Documentation:**
```
banxway-backend/
├── CLAUDE.md                         # This file - development standards
├── README.md                         # Project overview and setup
├── CREDENTIALS.md                    # Actual credentials (GITIGNORED)
├── DATABASE_SETUP.md                 # Database migration procedures
├── MIGRATION_QUERIES.md              # Quick SQL reference
├── NOTIFICATION_SYSTEM_SETUP.md      # Feature-specific setup guide
├── QUICK_FIX_NOTIFICATIONS.sql       # Emergency migration fixes
└── database/migrations/              # All SQL migrations
```

### When to Update Documentation

#### 1. Database Schema Changes

**When you create a new migration:**

```bash
# Created: database/migrations/006_new_feature.sql
```

**Update these files:**
- ✅ `DATABASE_SETUP.md` - Add to "Current Migrations" table
- ✅ `MIGRATION_QUERIES.md` - Add quick reference if complex
- ✅ Create `[FEATURE]_SETUP.md` if it's a new major feature
- ✅ Update `README_STANDARDS.md` if it affects development workflow

**Example:**
```markdown
## DATABASE_SETUP.md

| File | Description | Date | Status |
|------|-------------|------|--------|
| 006_new_feature.sql | Add new feature support | 2026-01-25 | ⏳ Pending |
```

#### 2. API Endpoint Changes

**When you add/modify an API endpoint:**

```typescript
// Created: src/api/v1/new-feature/index.ts
router.get('/api/v1/new-feature', ...)
```

**Update these files:**
- ✅ `CLAUDE.md` - Add to "API Response Standards" if new pattern
- ✅ `README.md` - Add to API endpoints list
- ✅ Create `[FEATURE]_API.md` for complex features with many endpoints

**Example:**
```markdown
## CLAUDE.md - API Response Standards

### New Feature Endpoints
- GET /api/v1/new-feature - Description
- POST /api/v1/new-feature - Description
```

#### 3. New Repository/Service

**When you create a new repository or service:**

```typescript
// Created: src/database/repositories/new.repository.ts
// Created: src/services/new.service.ts
```

**Update these files:**
- ✅ `CLAUDE.md` - Add example to "Database Access Patterns"
- ✅ `README.md` - Add to project structure
- ✅ Update repository template if new pattern introduced

#### 4. Environment Variables

**When you add new environment variables:**

```env
NEW_API_KEY=xxx
NEW_SERVICE_URL=xxx
```

**Update these files:**
- ✅ `CREDENTIALS.md` - Add actual value (gitignored)
- ✅ `.env.example` - Add placeholder
- ✅ `README.md` - Add to environment variables section
- ✅ `CLAUDE.md` - Add to "Environment Variables" section

#### 5. New Feature Implementation

**When you implement a complete new feature:**

**Create a dedicated setup guide:**
```
[FEATURE_NAME]_SETUP.md
```

**Include:**
- What was implemented (backend + frontend)
- Database schema changes
- API endpoints
- Setup instructions
- Testing procedures
- Troubleshooting guide

**Example:** `NOTIFICATION_SYSTEM_SETUP.md`

### Documentation Templates

#### Feature Setup Guide Template

```markdown
# [Feature Name] Setup Guide

## What Was Implemented

### Backend
- Database tables
- Repositories
- Services
- API endpoints

### Frontend
- API clients
- Components
- State management

## Setup Instructions

### Step 1: Database Migration
[Instructions]

### Step 2: Backend Configuration
[Instructions]

### Step 3: Frontend Configuration
[Instructions]

## Testing

[Test procedures]

## Troubleshooting

[Common issues and solutions]
```

#### Migration Documentation Template

```sql
-- Migration: [NNN]_[description].sql
-- Purpose: [What this migration does]
-- Created: [Date]
-- Author: [Name]

-- IMPORTANT: Dependencies
-- This migration requires:
-- - Migration 001_initial_schema.sql (for users table)
-- - Migration 002_other.sql (for other_table)

-- IMPORTANT: Breaking Changes
-- [List any breaking changes]

[SQL content]
```

### Documentation Update Checklist

**Before committing code, verify:**

- [ ] Updated relevant documentation files
- [ ] Added migration to DATABASE_SETUP.md if applicable
- [ ] Created/updated feature setup guide if major feature
- [ ] Updated CLAUDE.md if new patterns introduced
- [ ] Updated CREDENTIALS.md if new secrets added
- [ ] Updated README.md if project structure changed
- [ ] Verified all links work
- [ ] Checked for outdated information

### Git Commit Message for Documentation

**Format:**
```
docs([scope]): [description]

[Details about what was updated]

Updated files:
- [file1]
- [file2]

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Example:**
```
docs(notifications): add complete setup guide

Created NOTIFICATION_SYSTEM_SETUP.md with:
- Implementation details
- Setup instructions
- Testing procedures
- Troubleshooting guide

Updated files:
- DATABASE_SETUP.md (added migration 005)
- CLAUDE.md (updated table of contents)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Documentation Maintenance Schedule

**Weekly:**
- [ ] Review all .md files for outdated information
- [ ] Update version numbers
- [ ] Check all links are working

**After Each Release:**
- [ ] Update README.md with new features
- [ ] Update CHANGELOG.md (if exists)
- [ ] Archive old setup guides if superseded

**Monthly:**
- [ ] Review and consolidate documentation
- [ ] Remove deprecated information
- [ ] Update screenshots/examples

### Documentation Best Practices

**DO:**
- ✅ Use clear, concise language
- ✅ Include code examples
- ✅ Provide step-by-step instructions
- ✅ Add troubleshooting sections
- ✅ Keep file names descriptive (UPPERCASE_WITH_UNDERSCORES.md)
- ✅ Use tables for structured data
- ✅ Include "Last Updated" dates
- ✅ Cross-reference related documents

**DON'T:**
- ❌ Leave TODO or placeholder text
- ❌ Include secrets in committed documentation
- ❌ Use relative dates ("yesterday", "last week")
- ❌ Duplicate information across files
- ❌ Write documentation after the fact
- ❌ Use ambiguous language ("maybe", "possibly")

---

## Error Handling Standards

### 1. Repository Layer

**MANDATORY: Graceful degradation for missing tables**

```typescript
class ExampleRepository {
  /**
   * Check if table exists and is accessible
   */
  private isTableMissingError(error: any): boolean {
    return (
      error.code === '42P01' || // PostgreSQL: undefined_table
      error.message?.includes('table_name') && error.message?.includes('not found') ||
      error.message?.includes('schema cache')
    );
  }

  async findAll(): Promise<Example[]> {
    const { data, error } = await supabaseAdmin
      .from('examples')
      .select('*');

    if (error) {
      // CRITICAL: Return empty data if table doesn't exist (graceful degradation)
      if (this.isTableMissingError(error)) {
        logger.debug('Examples table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching examples', { error: error.message });
      throw error;
    }

    return data as Example[];
  }

  async findById(id: string): Promise<Example | null> {
    const { data, error } = await supabaseAdmin
      .from('examples')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found

      // CRITICAL: Return null if table doesn't exist (graceful degradation)
      if (this.isTableMissingError(error)) {
        logger.debug('Examples table not found - returning null');
        return null;
      }

      logger.error('Error fetching example', { id, error: error.message });
      throw error;
    }

    return data as Example;
  }
}
```

**Why this matters:**
- Backend must work even if database tables don't exist yet
- Users can start using the application before running migrations
- No 500 errors for missing infrastructure
- Clear debug logging for developers

### 2. Service Layer

```typescript
class ExampleService {
  async getExamples(): Promise<Example[]> {
    try {
      return await exampleRepository.findAll();
    } catch (error) {
      logger.error('Failed to get examples', { error });
      throw new ApiError(500, 'Failed to retrieve examples');
    }
  }

  async getExampleById(id: string): Promise<Example> {
    try {
      const example = await exampleRepository.findById(id);

      if (!example) {
        throw new ApiError(404, 'Example not found');
      }

      return example;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error('Failed to get example', { id, error });
      throw new ApiError(500, 'Failed to retrieve example');
    }
  }

  async createExample(data: CreateExampleRequest): Promise<Example> {
    try {
      // Validation
      if (!data.name || data.name.trim().length === 0) {
        throw new ApiError(400, 'Name is required');
      }

      return await exampleRepository.create(data);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error('Failed to create example', { data, error });
      throw new ApiError(500, 'Failed to create example');
    }
  }
}
```

### 3. Route/Controller Layer

```typescript
router.get('/examples', async (req: Request, res: Response) => {
  try {
    const examples = await exampleService.getExamples();

    res.json({
      success: true,
      data: examples,
      count: examples.length
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    }

    logger.error('Unexpected error in GET /examples', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

router.post('/examples', async (req: Request, res: Response) => {
  try {
    const example = await exampleService.createExample(req.body);

    res.status(201).json({
      success: true,
      data: example
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    }

    logger.error('Unexpected error in POST /examples', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});
```

### 4. Custom Error Classes

```typescript
// src/utils/errors.ts

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, public fields?: Record<string, string>) {
    super(400, message, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, identifier?: string) {
    super(404, `${resource} not found${identifier ? `: ${identifier}` : ''}`, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}
```

---

## Logging Methodology

### Logger Configuration

**Location:** `src/utils/logger.ts`

**Rules:**
1. NEVER use `console.log`, `console.error`, `console.warn`, or `console.debug` directly
2. ALWAYS use structured logger
3. NEVER log stack traces (unless critical unhandled errors)
4. ALWAYS provide context with log messages

### Log Levels

```typescript
import { logger } from '../utils/logger';

// ERROR: Something failed, needs attention
logger.error('Failed to process payment', {
  orderId: '123',
  error: error.message, // NOT error.stack
  userId: 'user-456'
});

// WARN: Something unusual but not critical
logger.warn('Slow database query detected', {
  query: 'SELECT * FROM users',
  duration: 5000,
  threshold: 1000
});

// INFO: Important business events
logger.info('User registered', {
  userId: 'user-789',
  email: 'user@example.com',
  role: 'customer'
});

// DEBUG: Development/troubleshooting info
logger.debug('Email accounts table not found - returning empty array', {
  context: 'repository.findAll'
});
```

### What to Log

**DO Log:**
- API requests/responses (via middleware)
- Database operations (errors only)
- External API calls (Exotel, etc.)
- Authentication events
- Business events (user registration, shipment created, etc.)
- Performance issues (slow queries, high memory)

**DON'T Log:**
- Passwords or secrets
- Credit card numbers
- Personal identifiable information (PII) in production
- Full stack traces (use error.message)
- Every database query (too noisy)

### Context Objects

```typescript
// Good: Structured context
logger.info('Thread assigned', {
  threadId: 'thread-123',
  assignedTo: 'user-456',
  assignedBy: 'user-789',
  timestamp: new Date().toISOString()
});

// Bad: String concatenation
logger.info(`Thread thread-123 assigned to user-456 by user-789`);
```

### Repository Logging Pattern

```typescript
class ExampleRepository {
  async create(data: CreateExampleRequest): Promise<Example> {
    const { data: result, error } = await supabaseAdmin
      .from('examples')
      .insert(data)
      .select()
      .single();

    if (error) {
      logger.error('Error creating example', { error: error.message });
      throw error;
    }

    logger.info('Example created', { id: result.id, name: result.name });
    return result as Example;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('examples')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting example', { id, error: error.message });
      throw error;
    }

    logger.info('Example deleted', { id });
  }
}
```

---

## Database Access Patterns

### 1. Repository Pattern

**MANDATORY: All database access must go through repositories**

```
src/database/repositories/
  ├── user.repository.ts
  ├── communication-thread.repository.ts
  ├── communication-message.repository.ts
  ├── email-account.repository.ts
  └── shipment.repository.ts
```

### 2. Repository Structure

```typescript
// src/database/repositories/example.repository.ts

import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';

export interface Example {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface CreateExampleRequest {
  name: string;
}

export interface UpdateExampleRequest {
  name?: string;
}

class ExampleRepository {
  /**
   * Check if table exists (for graceful degradation)
   */
  private isTableMissingError(error: any): boolean {
    return (
      error.code === '42P01' ||
      error.message?.includes('examples') && error.message?.includes('not found') ||
      error.message?.includes('schema cache')
    );
  }

  /**
   * Find all examples
   */
  async findAll(): Promise<Example[]> {
    const { data, error } = await supabaseAdmin
      .from('examples')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Examples table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching examples', { error: error.message });
      throw error;
    }

    return data as Example[];
  }

  /**
   * Find example by ID
   */
  async findById(id: string): Promise<Example | null> {
    const { data, error } = await supabaseAdmin
      .from('examples')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      if (this.isTableMissingError(error)) {
        logger.debug('Examples table not found - returning null');
        return null;
      }

      logger.error('Error fetching example', { id, error: error.message });
      throw error;
    }

    return data as Example;
  }

  /**
   * Create new example
   */
  async create(data: CreateExampleRequest): Promise<Example> {
    const { data: result, error } = await supabaseAdmin
      .from('examples')
      .insert(data)
      .select()
      .single();

    if (error) {
      logger.error('Error creating example', { error: error.message });
      throw error;
    }

    logger.info('Example created', { id: result.id });
    return result as Example;
  }

  /**
   * Update example
   */
  async update(id: string, updates: UpdateExampleRequest): Promise<Example> {
    const { data, error } = await supabaseAdmin
      .from('examples')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating example', { id, error: error.message });
      throw error;
    }

    logger.info('Example updated', { id });
    return data as Example;
  }

  /**
   * Delete example
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('examples')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting example', { id, error: error.message });
      throw error;
    }

    logger.info('Example deleted', { id });
  }
}

export default new ExampleRepository();
```

### 3. Database Migrations

**See:** `DATABASE_SETUP.md` for complete migration guide

**Quick reference:**
```bash
# Run all migrations
DATABASE_URL="postgresql://..." node migrate-all.js

# Migrations are in
database/migrations/NNN_description.sql
```

### 4. Encrypted Fields

For sensitive data (passwords, API keys):

```typescript
// Use PostgreSQL encryption functions
async create(data: CreateEmailAccountRequest): Promise<EmailAccount> {
  // Encrypt passwords
  const [smtpEncrypted, imapEncrypted] = await Promise.all([
    supabaseAdmin.rpc('encrypt_email_password', { password: data.smtp_password }),
    supabaseAdmin.rpc('encrypt_email_password', { password: data.imap_password }),
  ]);

  if (smtpEncrypted.error || imapEncrypted.error) {
    logger.error('Error encrypting passwords', {
      smtpError: smtpEncrypted.error?.message,
      imapError: imapEncrypted.error?.message,
    });
    throw smtpEncrypted.error || imapEncrypted.error;
  }

  // Store encrypted values
  const newAccount = {
    ...data,
    smtp_pass_encrypted: smtpEncrypted.data,
    imap_pass_encrypted: imapEncrypted.data,
  };

  // Continue with insert...
}

// Decrypt when needed
async getWithDecryptedPasswords(accountId: string): Promise<EmailAccountDecrypted | null> {
  const account = await this.findById(accountId);
  if (!account) return null;

  const [smtpResult, imapResult] = await Promise.all([
    supabaseAdmin.rpc('decrypt_email_password', { encrypted: account.smtp_pass_encrypted }),
    supabaseAdmin.rpc('decrypt_email_password', { encrypted: account.imap_pass_encrypted }),
  ]);

  if (smtpResult.error || imapResult.error) {
    logger.error('Error decrypting passwords', { accountId });
    throw smtpResult.error || imapResult.error;
  }

  return {
    ...account,
    smtp_password: smtpResult.data,
    imap_password: imapResult.data,
  };
}
```

---

## API Response Standards

### Success Responses

```typescript
// List endpoints
res.json({
  success: true,
  data: items,
  count: items.length,
  page: 1,        // Optional: if paginated
  pageSize: 20,   // Optional: if paginated
  total: 156      // Optional: if paginated
});

// Single item endpoints
res.json({
  success: true,
  data: item
});

// Create endpoints (201 status)
res.status(201).json({
  success: true,
  data: createdItem
});

// Update endpoints
res.json({
  success: true,
  data: updatedItem
});

// Delete endpoints (204 status)
res.status(204).send();

// Or with confirmation
res.json({
  success: true,
  message: 'Item deleted successfully'
});
```

### Error Responses

```typescript
// 400 Bad Request
res.status(400).json({
  success: false,
  error: 'Validation failed',
  details: {
    name: 'Name is required',
    email: 'Invalid email format'
  }
});

// 401 Unauthorized
res.status(401).json({
  success: false,
  error: 'Authentication required'
});

// 403 Forbidden
res.status(403).json({
  success: false,
  error: 'Insufficient permissions'
});

// 404 Not Found
res.status(404).json({
  success: false,
  error: 'Resource not found'
});

// 500 Internal Server Error
res.status(500).json({
  success: false,
  error: 'Internal server error'
});
```

---

## Code Organization

### Directory Structure

```
src/
├── api/
│   └── v1/
│       ├── routes/               # Route definitions
│       │   ├── auth.routes.ts
│       │   ├── users.routes.ts
│       │   └── communications.routes.ts
│       ├── analytics/            # Feature modules
│       ├── communications/
│       └── webhooks/
├── config/                       # Configuration
│   ├── database.config.ts
│   ├── redis.config.ts
│   └── env.config.ts
├── database/
│   ├── migrations/               # SQL migration files
│   ├── repositories/             # Data access layer
│   └── schema/
├── middleware/                   # Express middleware
│   ├── auth.middleware.ts
│   ├── validation.middleware.ts
│   └── error.middleware.ts
├── services/                     # Business logic
│   ├── email/
│   ├── ai/
│   ├── exotel/
│   └── analytics/
├── types/                        # TypeScript definitions
│   ├── express.d.ts
│   └── models.ts
├── utils/                        # Utilities
│   ├── logger.ts
│   ├── errors.ts
│   └── validation.ts
├── workers/                      # Background job workers
│   ├── email-poller.worker.ts
│   └── transcription.worker.ts
├── websocket/                    # WebSocket server
│   └── server.ts
└── index.ts                      # Application entry point
```

### File Naming Conventions

- **Routes:** `resource.routes.ts` (e.g., `users.routes.ts`)
- **Repositories:** `resource.repository.ts` (e.g., `user.repository.ts`)
- **Services:** `resource.service.ts` or `service-name.service.ts`
- **Middleware:** `purpose.middleware.ts` (e.g., `auth.middleware.ts`)
- **Workers:** `job-name.worker.ts` (e.g., `email-poller.worker.ts`)
- **Types:** `*.types.ts` or `models.ts`

---

## Testing Strategy

### Test Structure

```
tests/
├── unit/                         # Unit tests
│   ├── repositories/
│   ├── services/
│   └── utils/
├── integration/                  # Integration tests
│   ├── api/
│   └── database/
└── e2e/                          # End-to-end tests
    └── workflows/
```

### Unit Tests

```typescript
// tests/unit/repositories/example.repository.test.ts

import exampleRepository from '../../../src/database/repositories/example.repository';

describe('ExampleRepository', () => {
  describe('findAll', () => {
    it('should return empty array when table does not exist', async () => {
      // Mock Supabase to return table not found error
      // ...

      const result = await exampleRepository.findAll();

      expect(result).toEqual([]);
    });

    it('should return all examples', async () => {
      // Mock Supabase to return data
      // ...

      const result = await exampleRepository.findAll();

      expect(result).toHaveLength(2);
    });
  });
});
```

### Integration Tests

```typescript
// tests/integration/api/examples.test.ts

import request from 'supertest';
import app from '../../../src/index';

describe('GET /api/v1/examples', () => {
  it('should return 200 and empty array when no data', async () => {
    const response = await request(app)
      .get('/api/v1/examples')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: [],
      count: 0
    });
  });
});
```

---

## Security Requirements

### 1. Authentication Middleware

**MANDATORY: All protected routes must use auth middleware**

```typescript
import { authMiddleware } from '../middleware/auth.middleware';

// Protected route
router.get('/examples', authMiddleware, async (req, res) => {
  // req.user is available here
});

// Public route (no middleware)
router.get('/health', async (req, res) => {
  res.json({ status: 'ok' });
});
```

### 2. Role-Based Access Control

```typescript
import { requireRole } from '../middleware/auth.middleware';

// Admin only
router.delete('/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  // Only admins can access
});

// Admin or Manager
router.get('/analytics', authMiddleware, requireRole(['admin', 'manager']), async (req, res) => {
  // Admins and managers can access
});
```

### 3. Input Validation

```typescript
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validation.middleware';

router.post('/examples',
  authMiddleware,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Invalid email'),
  ],
  validate,
  async (req, res) => {
    // Validation passed
  }
);
```

### 4. Secrets Management

**NEVER hardcode secrets in code**

```typescript
// Good: Use environment variables
const apiKey = process.env.EXOTEL_API_KEY;

// Bad: Hardcoded secret
const apiKey = 'abc123xyz';
```

### 5. SQL Injection Prevention

**ALWAYS use parameterized queries (handled by Supabase)**

```typescript
// Good: Parameterized (Supabase handles this)
const { data } = await supabaseAdmin
  .from('users')
  .select('*')
  .eq('email', userEmail);

// Bad: String concatenation (DON'T DO THIS)
const query = `SELECT * FROM users WHERE email = '${userEmail}'`;
```

---

## Deployment Process

### 1. Local Development

```bash
# Start development server
npm run dev

# Run tests
npm test

# Type checking
npm run type-check

# Linting
npm run lint
```

### 2. Build

```bash
# Build TypeScript
npm run build

# Output: dist/
```

### 3. Docker Build

```bash
# Build for Azure (linux/amd64)
docker build --platform linux/amd64 -t banxway-backend:latest .
```

### 4. Deploy to Azure

```bash
# Run deployment script
cd banxway-backend
./deploy-azure.sh

# Or manual:
az acr build \
  --registry banxwayacr \
  --image banxway-backend:latest \
  --file Dockerfile \
  .

az containerapp update \
  --name banxway-api \
  --resource-group banxway-platform-prod \
  --image banxwayacr.azurecr.io/banxway-backend:latest
```

### 5. Database Migrations

**CRITICAL: Run migrations BEFORE deploying code that depends on new schema**

```bash
# Get connection string from Supabase Dashboard or CREDENTIALS.md
DATABASE_URL="postgresql://..." node migrate-all.js
```

### 6. Health Check

```bash
# Verify deployment
curl https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/health

# Should return:
# {"status":"ok","timestamp":"2026-01-25...","environment":"production"}
```

---

## Environment Variables

### Required Variables

```bash
# Node Environment
NODE_ENV=production
PORT=8000
WS_PORT=8002

# CORS
CORS_ORIGIN=https://banxway.vercel.app,https://banxway-frontend.vercel.app

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Redis (BullMQ)
REDIS_URL=redis://...

# JWT
JWT_SECRET=your-jwt-secret

# Encryption
USE_DATABASE_CREDENTIALS=true
ENCRYPTION_MASTER_KEY=base64-encoded-key

# Exotel
EXOTEL_SID=your-sid
EXOTEL_TOKEN=your-token
EXOTEL_API_KEY=your-api-key
EXOTEL_PHONE_NUMBER=01141169368
EXOTEL_SMS_NUMBER=01141169368
EXOTEL_WHATSAPP_NUMBER=01141169368
EXOTEL_API_URL=https://api.exotel.com
EXOTEL_WEBHOOK_BASE_URL=https://banxway-api...azurecontainerapps.io
```

---

## Forbidden Practices

### ❌ NEVER:

1. Use `console.log`, `console.error`, etc. (use `logger` instead)
2. Throw 500 errors for missing database tables (return empty data instead)
3. Hardcode secrets or credentials
4. Modify existing migration files (create new ones)
5. Skip authentication middleware on protected routes
6. Return full stack traces to clients
7. Log passwords, tokens, or PII
8. Use string concatenation for SQL queries
9. Commit `.env` files or `CREDENTIALS.md`
10. Deploy without running migrations first

---

## Quick Reference Commands

```bash
# Development
npm run dev              # Start dev server
npm test                 # Run tests
npm run type-check       # TypeScript validation
npm run lint             # ESLint

# Build & Deploy
npm run build            # Build TypeScript
./deploy-azure.sh        # Deploy to Azure

# Database
node migrate-all.js      # Run migrations

# Docker
docker build --platform linux/amd64 -t banxway-backend:latest .
```

---

## Related Documentation

- **Database Setup:** `../DATABASE_SETUP.md`
- **Credentials:** `../CREDENTIALS.md` (gitignored)
- **Migrations Guide:** `../MIGRATIONS.md`
- **Frontend Standards:** `../banxway-platform/CLAUDE.md`

---

**Last Updated:** 2026-01-25
**Project:** Banxway Backend API
**Maintained By:** Development Team
