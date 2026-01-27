# Banxway Backend Platform

Backend API server for the Banxway freight forwarding platform. Built with Node.js, Express, TypeScript, and Supabase.

**Production:** https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io

---

## 🏗️ Architecture

- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL (Supabase)
- **Auth**: Supabase Auth (JWT)
- **Storage**: Supabase Storage
- **Queue**: Redis + BullMQ
- **Real-time**: Socket.io
- **Email**: Nodemailer + IMAP
- **Telephony**: Exotel API (WhatsApp, SMS, Voice)
- **AI**: OpenAI/Anthropic
- **CRM**: EspoCRM Integration
- **Deployment**: Azure Container Apps

---

## 🚀 What's New (4-Week Implementation Complete)

### Week 1-4 Freight Forwarding System

✅ **Quotation Management System**
- Create, update, and track quotations
- Quote numbering system (QT-YYYYMMDD-XXX)
- Status workflow: DRAFT → SENT → ACCEPTED/REJECTED
- Link quotations to shipments

✅ **CRM Lead & Customer Management**
- Customer/lead tracking with India-specific fields (GST, PAN, IEC)
- Contact management per customer
- Credit terms and tier management
- KYC status tracking
- Customer code generation

✅ **Excel/CSV Bulk Import**
- Import customers, contacts, quotations, shipments, leads
- Background processing with BullMQ
- Row-level error tracking
- Progress monitoring
- Validation and error reporting

✅ **EspoCRM Integration**
- Bidirectional sync (Banxway ↔ EspoCRM)
- Customer → Account mapping
- Contact → Contact mapping
- Quotation → Opportunity mapping
- Webhook handlers for real-time updates
- Sync logging and statistics

✅ **Enhanced Shipment Tracking**
- 12-stage workflow support (Quote → Booking → ... → Closure)
- 6 shipment types (Air Import/Export, ODC, Break Bulk, Sea/Air Third Country)
- Stage history tracking with audit trail
- Document checklist per shipment
- Quotation linkage

---

## 📁 Project Structure

```
src/
├── api/v1/                      # API Routes
│   ├── communications/          # Communication threads & messages
│   ├── shipments/               # Shipment tracking
│   ├── quotations/              # NEW: Quotation management
│   ├── crm/                     # NEW: CRM customers & contacts
│   ├── excel-import/            # NEW: Excel bulk import
│   ├── workflows/               # Workflow engine
│   ├── compose/                 # AI compose endpoints
│   ├── users/                   # User management
│   ├── customers/               # Customer management
│   ├── notifications/           # Notifications
│   ├── analytics/               # Analytics
│   ├── documents/               # Document management
│   └── webhooks/                # External webhooks (Exotel, EspoCRM)
│
├── services/                    # Business Logic
│   ├── communication/           # Thread, message, action services
│   ├── quotation.service.ts     # NEW: Quotation business logic
│   ├── crm.service.ts           # NEW: CRM operations
│   ├── crm-sync.service.ts      # NEW: EspoCRM synchronization
│   ├── email/                   # Email send/receive
│   ├── whatsapp/                # WhatsApp integration (Exotel)
│   ├── sms/                     # SMS integration (Exotel)
│   ├── voice/                   # Voice call handling
│   ├── compose/                 # AI compose logic
│   ├── workflow/                # Workflow engine
│   ├── agent/                   # AgentBuilder MCP
│   ├── storage/                 # File management
│   ├── ai/                      # AI services
│   └── analytics/               # Metrics tracking
│
├── workers/                     # Background Jobs
│   ├── email-poller.worker.ts
│   ├── excel-import.worker.ts   # NEW: Excel import processor
│   ├── whatsapp-processor.worker.ts
│   ├── sla-checker.worker.ts
│   └── analytics.worker.ts
│
├── websocket/                   # WebSocket Handlers
│   ├── server.ts
│   └── handlers/
│
├── database/                    # Database Layer
│   ├── migrations/              # SQL migrations (001-010)
│   ├── repositories/            # Data access layer
│   │   ├── quotation.repository.ts      # NEW
│   │   ├── crm-customer.repository.ts   # NEW
│   │   ├── shipment.repository.ts
│   │   └── ...
│   └── models/                  # Type definitions
│
├── middleware/                  # Express Middleware
│   ├── auth.middleware.ts
│   ├── error.middleware.ts
│   ├── logger.middleware.ts
│   └── rate-limit.middleware.ts
│
├── lib/                         # Shared Libraries
│   └── storage.ts               # NEW: Storage utilities
│
├── utils/                       # Utilities
│   ├── logger.ts
│   ├── validation.ts
│   ├── helpers.ts
│   └── email-parser.ts
│
├── types/                       # TypeScript Types
│   ├── excel-import.types.ts    # NEW
│   └── index.ts
│
├── config/                      # Configuration
│   ├── database.config.ts
│   ├── redis.config.ts
│   ├── email.config.ts
│   ├── exotel.config.ts
│   ├── ai.config.ts
│   └── agent.config.ts
│
└── index.ts                     # Main entry point
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Redis (for BullMQ)
- PostgreSQL (or Supabase account)
- SMTP/IMAP credentials
- Exotel account (for WhatsApp/SMS)
- Azure CLI (for deployment)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your credentials (see CREDENTIALS.md)
nano .env
```

### Environment Variables

See `.env.example` for all required variables. Key variables:

```env
# Server
NODE_ENV=production
PORT=8000
WS_PORT=8002
CORS_ORIGIN=https://banxway-frontend.vercel.app

# Database (Supabase)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Redis (BullMQ)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-jwt-secret

# Encryption (for email passwords)
USE_DATABASE_CREDENTIALS=true
ENCRYPTION_MASTER_KEY=base64-encoded-key

# Exotel (WhatsApp, SMS, Voice)
EXOTEL_SID=your-sid
EXOTEL_TOKEN=your-token
EXOTEL_API_KEY=your-api-key
EXOTEL_PHONE_NUMBER=01141169368
EXOTEL_SMS_NUMBER=01141169368
EXOTEL_WHATSAPP_NUMBER=01141169368
EXOTEL_API_URL=https://api.exotel.com
EXOTEL_WEBHOOK_BASE_URL=https://banxway-api...azurecontainerapps.io

# EspoCRM Integration (Optional)
ESPOCRM_ENABLED=false
ESPOCRM_API_URL=http://localhost:8080/api/v1
ESPOCRM_API_KEY=your-espocrm-key
ESPOCRM_WEBHOOK_SECRET=your-webhook-secret

# AI (Optional)
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
```

### Database Setup

**Production (Supabase):**
```bash
# Set DATABASE_URL from CREDENTIALS.md
export DATABASE_URL="postgresql://..."

# Run all migrations
node migrate-all.js
```

**Migrations included:**
- 001: Initial schema (users, threads, messages)
- 002: Channel types and notifications
- 003: Email accounts
- 004: Settings configuration
- 005: Notifications system
- 006: AgentBuilder MCP integration
- 007: Freight workflows (quotations, shipments)
- 008: CRM leads and customers
- 009: Excel import jobs
- 010: CRM sync logs

### Development

```bash
# Start Redis
docker-compose up -d redis

# Start development server
npm run dev

# Server will run on http://localhost:8000
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Build & Production

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

---

## 📡 API Endpoints

### Base URL

**Production:** `https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1`

**Local:** `http://localhost:8000/api/v1`

### Health Check

```
GET    /health                                    # Health status
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-26T13:06:39.781Z",
  "environment": "production",
  "version": "1.0.0"
}
```

### Quotations (NEW)

```
GET    /quotations                                # List quotations
POST   /quotations                                # Create quotation
GET    /quotations/:id                            # Get quotation by ID
PATCH  /quotations/:id                            # Update quotation
PATCH  /quotations/:id/status                     # Update status
DELETE /quotations/:id                            # Delete quotation
```

**Example:**
```bash
curl -X POST https://banxway-api.../api/v1/quotations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "ABC Corp",
    "customer_email": "contact@abc.com",
    "shipment_type": "AIR_IMPORT",
    "origin_location": "Mumbai",
    "destination_location": "New York",
    "total_cost": 5000,
    "currency": "USD"
  }'
```

### CRM (NEW)

```
# Customers
GET    /crm/customers                             # List customers
POST   /crm/customers                             # Create customer
GET    /crm/customers/:id                         # Get customer
PATCH  /crm/customers/:id                         # Update customer
DELETE /crm/customers/:id                         # Delete customer

# Contacts
GET    /crm/customers/:customerId/contacts        # List contacts
POST   /crm/customers/:customerId/contacts        # Create contact
PATCH  /crm/contacts/:id                          # Update contact
DELETE /crm/contacts/:id                          # Delete contact

# CRM Sync (EspoCRM)
POST   /crm/sync-customer                         # Sync customer to EspoCRM
POST   /crm/sync-contact                          # Sync contact to EspoCRM
POST   /crm/sync-quotation                        # Sync quotation to EspoCRM
GET    /crm/sync-stats                            # Get sync statistics
```

### Excel Import (NEW)

```
POST   /excel-import/upload                       # Upload Excel file
GET    /excel-import/jobs                         # List import jobs
GET    /excel-import/jobs/:id                     # Get job status
GET    /excel-import/jobs/:id/errors              # Get row errors
POST   /excel-import/jobs/:id/cancel              # Cancel import
```

**Supported Import Types:**
- `CUSTOMERS` - Import customers/leads
- `CONTACTS` - Import customer contacts
- `QUOTATIONS` - Import quotations
- `SHIPMENTS` - Import shipments
- `LEADS` - Import leads

**Example:**
```bash
curl -X POST https://banxway-api.../api/v1/excel-import/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@customers.xlsx" \
  -F "import_type=CUSTOMERS"
```

### Shipments

```
GET    /shipments                                 # List shipments
POST   /shipments                                 # Create shipment
GET    /shipments/:id                             # Get shipment
PATCH  /shipments/:id                             # Update shipment
PATCH  /shipments/:id/stage                       # Update stage
GET    /shipments/:id/stage-history               # Get stage history
GET    /shipments/:id/documents                   # Get document checklist
```

**Shipment Types:**
- `AIR_IMPORT` - Air Import
- `AIR_EXPORT` - Air Export
- `ODC_IMPORT` - ODC Import
- `ODC_EXPORT` - ODC Export
- `BREAK_BULK_IMPORT` - Break Bulk Import
- `BREAK_BULK_EXPORT` - Break Bulk Export
- `SEA_AIR_THIRD_COUNTRY` - Sea/Air Third Country

**Shipment Stages:**
- `QUOTE_REQUEST` → `QUOTATION` → `BOOKING` → `DOCUMENTATION` → `CUSTOMS_CLEARANCE` → `CARGO_COLLECTION` → `IN_TRANSIT` → `PORT_ARRIVAL` → `CUSTOMS_DELIVERY` → `FINAL_DELIVERY` → `POD_COLLECTION` → `BILLING` → `CLOSURE`

### Communications

```
GET    /communications/threads                    # List threads
POST   /communications/threads                    # Create thread
GET    /communications/threads/:id                # Get thread
PATCH  /communications/threads/:id                # Update thread
DELETE /communications/threads/:id                # Archive thread

GET    /communications/threads/:id/messages       # Get messages
POST   /communications/threads/:id/messages       # Send message

GET    /communications/threads/:id/actions        # Get actions
POST   /communications/threads/:id/actions        # Create action
```

### Compose (AI)

```
POST   /compose/suggestions                       # Generate drafts (SSE)
POST   /compose/feedback                          # Submit feedback
```

### Workflows

```
GET    /workflows/definitions                     # List workflows
POST   /workflows/definitions                     # Create workflow
GET    /workflows/instances                       # List instances
POST   /workflows/instances                       # Start workflow
```

### Users

```
GET    /users/me                                  # Get current user
PATCH  /users/me                                  # Update profile
GET    /users                                     # List users (admin)
```

### Notifications

```
GET    /notifications                             # List notifications
PATCH  /notifications/:id/read                    # Mark as read
POST   /notifications/read-all                    # Mark all as read
```

### Analytics

```
GET    /analytics/dashboard                       # Dashboard stats
GET    /analytics/threads                         # Thread analytics
GET    /analytics/users                           # User performance
```

### Settings

```
GET    /settings                                  # Settings overview
GET    /settings/configuration-status             # Check configuration

GET    /settings/email-accounts                   # List email accounts
POST   /settings/email-accounts                   # Add email account
PATCH  /settings/email-accounts/:id               # Update account
DELETE /settings/email-accounts/:id               # Delete account

GET    /settings/integrations                     # List integrations
POST   /settings/integrations/:type               # Configure integration
POST   /settings/integrations/:type/test          # Test connection
```

### Webhooks

```
# EspoCRM Webhooks (NEW)
POST   /webhooks/espocrm/account                  # Account updated
POST   /webhooks/espocrm/contact                  # Contact updated
POST   /webhooks/espocrm/opportunity              # Opportunity updated
GET    /webhooks/espocrm/health                   # Health check

# Exotel Webhooks
POST   /webhooks/exotel/whatsapp                  # WhatsApp message
POST   /webhooks/exotel/sms                       # SMS received
POST   /webhooks/exotel/call                      # Call completed
```

---

## 🔌 WebSocket Events

### Client → Server

```typescript
'authenticate' → { token: string }
'thread:join' → { threadId: string }
'thread:leave' → { threadId: string }
'thread:typing' → { threadId: string, isTyping: boolean }
'message:send' → { threadId: string, message: NewMessage }
```

### Server → Client

```typescript
'connected' → { userId: string }
'authenticated' → { user: User }
'thread:new' → { thread: Thread }
'thread:updated' → { threadId: string, updates: Partial<Thread> }
'thread:message' → { threadId: string, message: Message }
'notification:new' → { notification: Notification }
```

---

## 🔧 Background Workers

### Email Poller

Polls IMAP inbox every 30 seconds for new emails.

### Excel Import Worker (NEW)

Processes Excel/CSV imports in background using BullMQ.

**Features:**
- Parses Excel/CSV files using xlsx library
- Row-by-row validation
- Batch database operations
- Error tracking per row
- Progress updates

**Supported Formats:**
- `.xlsx` - Excel 2007+
- `.xls` - Excel 97-2003
- `.csv` - Comma-separated values

### WhatsApp Processor

Processes incoming WhatsApp messages from Exotel webhooks.

### SLA Checker

Runs every 5 minutes to check threads approaching SLA deadlines.

### Analytics Worker

Aggregates metrics and generates reports periodically.

---

## 📊 Database Schema

See `database/migrations/` for complete schema.

### Core Tables

**Existing:**
- `users` - User accounts
- `customers` - Customer records
- `contacts` - Customer contacts
- `communication_threads` - Communication threads
- `communication_messages` - Messages
- `communication_actions` - Action items
- `workflow_definitions` - Workflow templates
- `workflow_instances` - Workflow executions
- `notifications` - User notifications
- `email_accounts` - Email account configurations

**NEW (Week 1-4):**
- `quotations` - Quotation management
- `crm_customers` - CRM customers and leads
- `crm_contacts` - Customer contact persons
- `shipments` - Enhanced with quotation linkage
- `shipment_stage_history` - Stage transition audit trail
- `shipment_documents` - Document checklist
- `excel_import_jobs` - Excel import job tracking
- `import_row_errors` - Import error details
- `crm_sync_logs` - EspoCRM sync logging

### Custom ENUM Types

```sql
-- Shipment types
shipment_type: AIR_IMPORT, AIR_EXPORT, ODC_IMPORT, ODC_EXPORT,
               BREAK_BULK_IMPORT, BREAK_BULK_EXPORT, SEA_AIR_THIRD_COUNTRY

-- Shipment stages
shipment_stage: QUOTE_REQUEST, QUOTATION, BOOKING, DOCUMENTATION,
                CUSTOMS_CLEARANCE, CARGO_COLLECTION, IN_TRANSIT,
                PORT_ARRIVAL, CUSTOMS_DELIVERY, FINAL_DELIVERY,
                POD_COLLECTION, BILLING, CLOSURE

-- Quotation status
quotation_status: DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED, CONVERTED

-- CRM customer status
crm_customer_status: LEAD, PROSPECT, CUSTOMER, INACTIVE

-- Customer tier
customer_tier: NEW, BRONZE, SILVER, GOLD, PLATINUM

-- Credit terms
credit_terms: ADVANCE, COD, NET_7, NET_15, NET_30, NET_45, NET_60, NET_90
```

---

## 🔐 Authentication

Uses Supabase Auth with JWT tokens. Include token in Authorization header:

```
Authorization: Bearer <token>
```

### Role-Based Access Control (RBAC)

Roles: `admin`, `manager`, `validator`, `support`, `viewer`

```typescript
// Require specific roles
router.delete('/quotations/:id',
  authenticateRequest,
  requireRole('admin', 'manager'),
  deleteQuotation
);
```

---

## 🚢 Deployment

### Production (Azure Container Apps)

**Current Deployment:**
- **URL:** https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io
- **Container Registry:** banxwayacr.azurecr.io
- **Image:** banxway-backend:latest
- **Resources:** 0.5 CPU, 1GB RAM
- **Scaling:** 1-5 replicas (auto-scaling)

**Deploy:**
```bash
# Build and deploy to Azure
./deploy-azure.sh

# Manual deployment
az acr build --registry banxwayacr --image banxway-backend:latest .
az containerapp update --name banxway-api --resource-group banxway-platform-prod --image banxwayacr.azurecr.io/banxway-backend:latest

# Check deployment status
az containerapp show --name banxway-api --resource-group banxway-platform-prod

# View logs
az containerapp logs show --name banxway-api --resource-group banxway-platform-prod --follow
```

### Docker (Local)

```bash
# Build for Azure (linux/amd64)
docker build --platform linux/amd64 -t banxway-backend:latest .

# Run locally
docker run -p 8000:8000 --env-file .env banxway-backend:latest
```

---

## 🧰 EspoCRM Integration (Optional)

### Setup EspoCRM

**Deploy with Docker Compose:**
```bash
# Copy environment file
cp .env.espocrm.example .env.espocrm

# Edit credentials
nano .env.espocrm

# Start EspoCRM
docker-compose -f docker-compose.espocrm.yml up -d

# Access EspoCRM
open http://localhost:8080
```

### Configure EspoCRM

1. **Login:** Default admin credentials from `.env.espocrm`
2. **Create API User:**
   - Administration → Users → Create User
   - Set role to "Admin"
   - Generate API Key
3. **Configure Custom Fields:**
   - Account: `customerCode`, `gstNumber`, `iecNumber`, `customerTier`
   - Contact: `designation`, `department`
4. **Set up Webhooks:**
   - Administration → Webhooks
   - Add webhook for Account.afterSave: `https://banxway-api.../api/v1/webhooks/espocrm/account`
   - Add webhook secret in Banxway backend env

### Enable Sync

```env
# In backend .env
ESPOCRM_ENABLED=true
ESPOCRM_API_URL=http://localhost:8080/api/v1
ESPOCRM_API_KEY=your-api-key
ESPOCRM_WEBHOOK_SECRET=your-secret
```

### Test Sync

```bash
# Sync a customer to EspoCRM
curl -X POST https://banxway-api.../api/v1/crm/sync-customer \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"customer_id":"uuid-here"}'

# Check sync statistics
curl https://banxway-api.../api/v1/crm/sync-stats \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📚 Additional Documentation

- **CLAUDE.md** - Development standards and best practices
- **DATABASE_SETUP.md** - Database migration guide
- **CREDENTIALS.md** - Production credentials (gitignored)
- **WEEK_4_DEPLOYMENT_GUIDE.md** - Complete deployment guide
- **IMPLEMENTATION_COMPLETE.md** - 4-week implementation summary

---

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Test Supabase connection
curl "https://thaobumtmokgayljvlgn.supabase.co/rest/v1/" \
  -H "apikey: your-anon-key"
```

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli -u $REDIS_URL ping
```

### Azure Container App Issues

```bash
# Check app status
az containerapp show -n banxway-api -g banxway-platform-prod

# Restart app
az containerapp restart -n banxway-api -g banxway-platform-prod

# View real-time logs
az containerapp logs tail -n banxway-api -g banxway-platform-prod
```

### Excel Import Issues

**Large Files Failing:**
- Limit to 10MB file size (enforced)
- Max 1000 rows recommended for performance

**Row Errors:**
```bash
# Check import job errors
curl https://banxway-api.../api/v1/excel-import/jobs/{jobId}/errors \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests first (TDD)
4. Commit changes (`git commit -m 'feat: add amazing feature'`)
5. Push to branch (`git push origin feature/amazing-feature`)
6. Open Pull Request

---

## 📄 License

Proprietary - Banxway © 2024-2026

---

## 🆘 Support

For issues and questions:
- Email: support@banxway.com
- Slack: #banxway-dev
- Documentation: https://docs.banxway.com

---

**Built with ❤️ by the Banxway Team**
