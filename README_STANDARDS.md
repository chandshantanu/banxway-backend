# Banxway Platform - Development Standards & Documentation

Complete reference guide for all development standards, procedures, and documentation.

---

## Documentation Structure

This project maintains comprehensive documentation for consistent development practices:

### 🔐 Credentials & Secrets

**File:** `CREDENTIALS.md` (⚠️ **GITIGNORED** - Local only)

Contains actual connection strings, API keys, and credentials for:
- Supabase database connections
- Azure resources (ACR, Container Apps)
- Exotel API credentials
- JWT secrets and encryption keys
- Vercel deployment info

**Access:** Local development only. Never commit to git.

---

### 🗄️ Database & Migrations

**File:** `DATABASE_SETUP.md`

Complete guide for database management:
- Migration system overview
- Running migrations (local & production)
- Creating new migrations
- Troubleshooting database issues
- Current schema reference
- Backup & restore procedures

**Quick Start:**
```bash
cd banxway-backend
DATABASE_URL="postgresql://..." node migrate-all.js
```

---

### 🔧 Backend Development

**File:** `banxway-backend/CLAUDE.md`

Comprehensive backend standards covering:

1. **Error Handling**
   - Graceful degradation for missing tables
   - Repository, service, and route layer patterns
   - Custom error classes

2. **Logging Methodology**
   - Structured logging with winston
   - Never use console.* directly
   - Context-based logging patterns

3. **Database Access**
   - Repository pattern (MANDATORY)
   - Supabase client usage
   - Encryption for sensitive data

4. **API Standards**
   - Response format conventions
   - Status code usage
   - Error response structure

5. **Security**
   - Authentication middleware
   - Role-based access control
   - Input validation
   - Secrets management

6. **Deployment**
   - Docker builds for Azure
   - Migration procedures
   - Health checks

**Tech Stack:** Node.js, Express, TypeScript, Supabase (PostgreSQL), Redis

---

### 🎨 Frontend Development

**File:** `banxway-platform/CLAUDE.md`

Comprehensive frontend standards covering:

1. **Error Handling**
   - API error parsing
   - Error categories
   - User-friendly messages
   - Global auth error handling

2. **Logging Methodology**
   - Structured client-side logging
   - Development console filtering
   - Context-based logging

3. **API Client Patterns**
   - API client structure
   - TanStack Query integration
   - Request/response typing

4. **State Management**
   - TanStack Query for server state (MANDATORY)
   - React Context for UI state
   - URL state for filters

5. **Component Architecture**
   - Directory structure
   - Component templates
   - Props typing

6. **Styling**
   - Tailwind CSS (MANDATORY)
   - Design system (colors, spacing, typography)
   - Responsive design patterns

7. **Performance**
   - Code splitting
   - Image optimization
   - Memoization strategies

**Tech Stack:** Next.js 14, React, TypeScript, TanStack Query, Tailwind CSS

---

## Quick Reference

### Starting a New Feature

1. **Plan the feature**
   - Check both CLAUDE.md files for relevant patterns
   - Identify database changes needed

2. **Backend changes:**
   ```bash
   # If database changes needed:
   # 1. Create migration: database/migrations/NNN_feature.sql
   # 2. Test locally: npm run migrate
   # 3. Create repository: src/database/repositories/feature.repository.ts
   # 4. Create service: src/services/feature.service.ts
   # 5. Create routes: src/api/v1/routes/feature.routes.ts
   # 6. Follow error handling patterns from CLAUDE.md
   ```

3. **Frontend changes:**
   ```bash
   # 1. Create API client: src/lib/api/feature.api.ts
   # 2. Create components: src/components/feature/
   # 3. Create page: src/app/(dashboard)/feature/page.tsx
   # 4. Use TanStack Query for data fetching
   # 5. Follow error handling patterns from CLAUDE.md
   ```

4. **Testing:**
   ```bash
   # Backend
   cd banxway-backend
   npm test
   npm run type-check
   npm run lint

   # Frontend
   cd banxway-platform
   npm test
   npm run type-check
   npm run lint
   ```

5. **Deploy:**
   ```bash
   # Run migrations first (if any)
   DATABASE_URL="..." node migrate-all.js

   # Deploy backend
   cd banxway-backend
   ./deploy-azure.sh

   # Frontend auto-deploys via Vercel on push to main
   ```

---

## File Organization

```
banxway-platform/
├── CREDENTIALS.md                    # ⚠️ GITIGNORED - Actual secrets
├── DATABASE_SETUP.md                 # Database & migration guide
├── README_STANDARDS.md               # This file
│
├── banxway-backend/
│   ├── CLAUDE.md                     # Backend development standards
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── deploy-azure.sh               # Azure deployment script
│   ├── migrate-all.js                # Migration runner
│   ├── database/
│   │   └── migrations/               # SQL migration files
│   │       ├── 001_initial_schema.sql
│   │       ├── 002_add_sms_and_transcription.sql
│   │       ├── 003_role_based_rls_policies.sql
│   │       └── 004_email_accounts.sql
│   └── src/
│       ├── api/v1/routes/            # API routes
│       ├── database/repositories/    # Data access layer
│       ├── services/                 # Business logic
│       ├── middleware/               # Express middleware
│       ├── utils/                    # Utilities
│       │   ├── logger.ts             # Structured logging
│       │   └── errors.ts             # Error classes
│       └── index.ts
│
└── banxway-platform/
    ├── CLAUDE.md                     # Frontend development standards
    ├── package.json
    ├── next.config.js
    └── src/
        ├── app/                      # Next.js App Router
        │   ├── (auth)/               # Auth pages
        │   ├── (dashboard)/          # Dashboard pages
        │   ├── layout.tsx
        │   └── globals.css
        ├── components/               # React components
        │   ├── ui/                   # Base UI components
        │   ├── dashboard/            # Dashboard components
        │   └── shared/               # Shared components
        ├── lib/                      # Utilities & config
        │   ├── api/                  # API clients
        │   │   ├── client.ts         # Base API client
        │   │   ├── auth.api.ts
        │   │   └── ...
        │   ├── logger.ts             # Client-side logging
        │   ├── errors.ts             # Error handling
        │   └── dev-console-filter.ts # Dev mode console filter
        └── contexts/                 # React contexts
            ├── auth-context.tsx
            └── query-provider.tsx
```

---

## Standards Checklist

### Before Committing Code

**Backend:**
- [ ] All database access goes through repositories
- [ ] Repositories handle missing tables gracefully (return empty data, not errors)
- [ ] No `console.log` - use `logger` instead
- [ ] Error handling at all layers (repository, service, route)
- [ ] API responses follow standard format
- [ ] TypeScript types defined for all interfaces
- [ ] No secrets hardcoded in code

**Frontend:**
- [ ] All API calls use TanStack Query
- [ ] No `console.log` - use `logger` instead
- [ ] Error handling with parseError/getUserErrorMessage
- [ ] Loading and error states for all async operations
- [ ] Tailwind CSS only (no inline styles)
- [ ] TypeScript types for all props and data
- [ ] No API keys in code

### Before Deploying

**Backend:**
- [ ] Run migrations first (if schema changed)
- [ ] Tests pass: `npm test`
- [ ] Type checking passes: `npm run type-check`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Environment variables updated in Azure

**Frontend:**
- [ ] Tests pass: `npm test`
- [ ] Type checking passes: `npm run type-check`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Environment variables updated in Vercel

---

## Common Tasks

### Adding a Database Table

1. **Create migration file:**
   ```bash
   cd banxway-backend/database/migrations
   touch 005_your_feature.sql
   ```

2. **Write SQL following template in DATABASE_SETUP.md**
   - Use `CREATE TABLE IF NOT EXISTS`
   - Add indexes
   - Enable RLS
   - Add policies
   - Add comments

3. **Test locally:**
   ```bash
   npm run migrate
   ```

4. **Create repository:**
   ```typescript
   // src/database/repositories/your-feature.repository.ts
   // Follow template in banxway-backend/CLAUDE.md
   ```

5. **Apply to production:**
   ```bash
   DATABASE_URL="..." node migrate-all.js
   ```

### Adding an API Endpoint

1. **Backend - Create route:**
   ```typescript
   // src/api/v1/routes/your-feature.routes.ts
   // Follow patterns in banxway-backend/CLAUDE.md
   ```

2. **Frontend - Create API client:**
   ```typescript
   // src/lib/api/your-feature.api.ts
   // Follow template in banxway-platform/CLAUDE.md
   ```

3. **Frontend - Use in component:**
   ```typescript
   // Use TanStack Query
   const { data } = useQuery({
     queryKey: ['your-feature'],
     queryFn: () => yourFeatureApi.getItems(),
   });
   ```

### Debugging Errors

1. **Check logs** (structured, not stack traces):
   ```bash
   # Backend logs
   az containerapp logs show --name banxway-api --resource-group banxway-platform-prod

   # Frontend logs
   # Check browser console (filtered in dev mode)
   ```

2. **Common issues:**
   - 500 error + "table not found" → Run migrations
   - 401 error → Check auth token/session
   - 403 error → Check user role/permissions
   - Network error → Check CORS configuration

---

## Key Principles

### 1. Graceful Degradation
Backend must work even if database tables don't exist yet. Return empty data, not 500 errors.

### 2. Structured Logging
Never use console.* directly. Always use logger with context. No stack traces except critical errors.

### 3. Error Handling at Every Layer
- Repository: Handle DB errors, return null/empty for missing data
- Service: Handle business logic errors, throw ApiError
- Route: Catch all errors, return appropriate HTTP status
- Frontend: Parse errors, show user-friendly messages

### 4. Type Safety
Everything must be typed. No `any` unless absolutely necessary.

### 5. Security First
- All sensitive data encrypted
- All protected routes use auth middleware
- Input validation on all endpoints
- Secrets in environment variables, never in code

---

## Getting Help

1. **Check relevant CLAUDE.md:**
   - Backend question? → `banxway-backend/CLAUDE.md`
   - Frontend question? → `banxway-platform/CLAUDE.md`
   - Database question? → `DATABASE_SETUP.md`

2. **Look for similar patterns:**
   - Check existing code in the same layer
   - Follow established patterns from CLAUDE.md

3. **Common patterns are documented:**
   - Error handling templates
   - Repository templates
   - API client templates
   - Component templates

---

## Maintenance

### Updating Standards

When you discover a new pattern or best practice:

1. Update the relevant CLAUDE.md file
2. Add examples if helpful
3. Update this README_STANDARDS.md if it affects overall workflow
4. Commit with clear message: `docs: update [backend/frontend] standards for [topic]`

### Reviewing Changes

Before approving PRs, verify:
- [ ] Follows patterns from CLAUDE.md
- [ ] Has proper error handling
- [ ] Uses structured logging
- [ ] No secrets committed
- [ ] Tests added/updated
- [ ] Documentation updated if needed

---

**Last Updated:** 2026-01-25
**Maintained By:** Development Team

---

## Related Files

- `CREDENTIALS.md` - Actual credentials (gitignored, local only)
- `DATABASE_SETUP.md` - Database and migration procedures
- `banxway-backend/CLAUDE.md` - Backend development standards
- `banxway-platform/CLAUDE.md` - Frontend development standards
- `.gitignore` - Ignored files (includes CREDENTIALS.md)
