# Banxway Backend Platform

Backend API server for the Banxway freight forwarding communication hub. Built with Node.js, Express, TypeScript, and Supabase.

## 🏗️ Architecture

- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL (Supabase)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage
- **Queue**: Redis + BullMQ
- **Real-time**: Socket.io
- **Email**: Nodemailer + IMAP
- **Telephony**: Exotel API
- **AI**: OpenAI/Anthropic
- **Deployment**: Vercel Functions

## 📁 Project Structure

```
src/
├── api/v1/                    # API Routes
│   ├── communications/        # Communication endpoints
│   ├── shipments/             # Shipment endpoints
│   ├── workflows/             # Workflow endpoints
│   ├── compose/               # AI compose endpoints
│   ├── users/                 # User management
│   ├── customers/             # Customer management
│   ├── notifications/         # Notifications
│   ├── analytics/             # Analytics
│   ├── documents/             # Document management
│   └── webhooks/              # External webhooks
│
├── services/                  # Business Logic
│   ├── communication/         # Thread, message, action services
│   ├── email/                 # Email send/receive
│   ├── whatsapp/              # WhatsApp integration
│   ├── sms/                   # SMS integration
│   ├── voice/                 # Voice call handling
│   ├── compose/               # AI compose logic
│   ├── workflow/              # Workflow engine
│   ├── agent/                 # AgentBuilder MCP
│   ├── storage/               # File management
│   ├── ai/                    # AI services
│   └── analytics/             # Metrics tracking
│
├── workers/                   # Background Jobs
│   ├── email-poller.worker.ts
│   ├── whatsapp-processor.worker.ts
│   ├── sla-checker.worker.ts
│   └── analytics.worker.ts
│
├── websocket/                 # WebSocket Handlers
│   ├── server.ts
│   └── handlers/
│
├── database/                  # Database Layer
│   ├── migrations/            # SQL migrations
│   ├── repositories/          # Data access
│   └── models/                # Type definitions
│
├── middleware/                # Express Middleware
│   ├── auth.middleware.ts
│   ├── error.middleware.ts
│   ├── logger.middleware.ts
│   └── rate-limit.middleware.ts
│
├── utils/                     # Utilities
│   ├── logger.ts
│   ├── validation.ts
│   ├── helpers.ts
│   └── email-parser.ts
│
├── types/                     # TypeScript Types
│   └── index.ts
│
├── config/                    # Configuration
│   ├── database.config.ts
│   ├── redis.config.ts
│   ├── email.config.ts
│   ├── exotel.config.ts
│   ├── ai.config.ts
│   └── agent.config.ts
│
└── index.ts                   # Main entry point
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Redis
- PostgreSQL (or Supabase account)
- SMTP/IMAP credentials
- Exotel account (for WhatsApp/SMS)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your credentials
nano .env
```

### Environment Variables

```env
# Server
NODE_ENV=development
PORT=8000
CORS_ORIGIN=http://localhost:3003

# Database
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis
REDIS_URL=redis://localhost:6379

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your-email@gmail.com
IMAP_PASS=your-app-password

# Exotel
EXOTEL_SID=your-sid
EXOTEL_TOKEN=your-token
EXOTEL_WHATSAPP_NUMBER=+1234567890

# AI
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx

# AgentBuilder MCP
MCP_API_URL=https://agentbuilder.example.com
MCP_API_TOKEN=xxx
MCP_WEBSOCKET_URL=wss://agentbuilder.example.com/ws
```

### Database Setup

```bash
# Start local PostgreSQL (or use Supabase)
docker-compose up -d postgres

# Run migrations
npm run migrate

# Seed database (optional)
npm run seed
```

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

## 🔧 Background Workers

Banxway uses **scalable background workers** for asynchronous job processing (emails, WhatsApp, transcriptions).

### Worker Types

| Worker | Purpose | Concurrency | Auto-Scaling |
|--------|---------|-------------|--------------|
| **Email Poller** | Poll IMAP for new emails | 5 | 1-5 replicas |
| **WhatsApp Processor** | Send WhatsApp via Exotel | 10 | 2-10 replicas |
| **Transcription Worker** | Transcribe call recordings | 3 | 1-3 replicas |

### Quick Start

**Local Development:**
```bash
# Start all workers (in separate terminal)
npm run workers:all:dev

# Or start individually
npm run worker:email-poller:dev
npm run worker:whatsapp:dev
npm run worker:transcription:dev
```

**Docker Compose (Recommended):**
```bash
# From platform root
docker-compose up -d

# Scale specific worker
docker-compose up --scale whatsapp-worker=3 -d

# View logs
docker-compose logs -f whatsapp-worker
```

**Azure Production:**
```bash
# Deploy with auto-scaling
./deploy-workers-azure.sh

# Check status
az containerapp list -g banxway-platform-prod
```

### Configuration

Create `.env.workers` from template:
```bash
cp .env.workers.example .env.workers
# Edit with your credentials
```

**Key Environment Variables:**
- `REDIS_URL` - Redis connection string
- `WORKER_CONCURRENCY` - Jobs per worker instance
- `EMAIL_POLL_INTERVAL` - Email polling interval (ms)
- `EXOTEL_*` - WhatsApp/SMS credentials
- `OPENAI_API_KEY` - Transcription API key

### Scaling

**Manual Scaling (Docker):**
```bash
docker-compose up --scale whatsapp-worker=5 -d
```

**Auto-Scaling (Azure):**
Workers automatically scale based on:
- Queue length (BullMQ job count)
- CPU/Memory utilization
- Custom metrics

**Configuration:**
- Min replicas: 1-2
- Max replicas: 3-10 (depends on worker type)
- Scale threshold: 10-20 jobs per replica

### Monitoring

**Queue Status:**
```bash
# Check pending jobs
redis-cli LLEN bull:whatsapp-processing:wait

# Check active jobs
redis-cli LLEN bull:whatsapp-processing:active
```

**Worker Logs:**
```bash
# Docker Compose
docker-compose logs -f [worker-name]

# Azure Container Apps
az containerapp logs show -n [worker-name] -g banxway-platform-prod
```

### Documentation

- **Quick Start Guide**: `WORKER_QUICKSTART.md` - Get started in 10 minutes
- **Comprehensive Guide**: `WORKER_SCALING.md` - Full deployment and scaling docs
- **Docker Compose**: `../docker-compose.yml` - Local stack configuration
- **Azure Deployment**: `deploy-workers-azure.sh` - Production deployment script

### Architecture

```
API Server → Redis Queue → Worker Cluster → Supabase DB
            (BullMQ)      (Auto-scaled)
```

Workers process jobs asynchronously:
1. API enqueues job to Redis
2. Available worker picks up job
3. Worker processes and updates database
4. WebSocket emits status update to UI

---

## 📡 API Endpoints

### Base URL: `/api/v1`

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

### Shipments

```
GET    /shipments                                 # List shipments
POST   /shipments                                 # Create shipment
GET    /shipments/:id                             # Get shipment
PATCH  /shipments/:id                             # Update shipment
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

### Customers

```
GET    /customers                                 # List customers
POST   /customers                                 # Create customer
GET    /customers/:id                             # Get customer
PATCH  /customers/:id                             # Update customer
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
GET    /settings                                   # Settings overview
GET    /settings/configuration-status              # Check what's configured

GET    /settings/email-accounts                    # List email accounts
POST   /settings/email-accounts                    # Add email account
PATCH  /settings/email-accounts/:id                # Update account
DELETE /settings/email-accounts/:id                # Delete account

GET    /settings/integrations                      # List integrations
GET    /settings/integrations/:type                # Get integration
POST   /settings/integrations/:type                # Configure integration
POST   /settings/integrations/:type/test           # Test connection
DELETE /settings/integrations/:type                # Delete integration

GET    /settings/phone-numbers                     # List phone numbers
POST   /settings/phone-numbers/:id/assign          # Assign to user
```

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

## 🔧 Background Workers

### Email Poller

Polls IMAP inbox every 30 seconds for new emails. Parses, threads, and stores messages.

### WhatsApp Processor

Processes incoming WhatsApp messages from Exotel webhooks.

### SLA Checker

Runs every 5 minutes to check threads approaching SLA deadlines.

### Analytics Worker

Aggregates metrics and generates reports periodically.

## 📊 Database Schema

See [src/database/migrations/001_initial_schema.sql](src/database/migrations/001_initial_schema.sql) for complete schema.

### Core Tables

- `users` - User accounts
- `customers` - Customer records
- `contacts` - Customer contacts
- `shipments` - Shipment records
- `communication_threads` - Communication threads
- `communication_messages` - Messages
- `communication_actions` - Action items
- `workflow_definitions` - Workflow templates
- `workflow_instances` - Workflow executions
- `notifications` - User notifications

## 🔐 Authentication

Uses Supabase Auth with JWT tokens. Include token in Authorization header:

```
Authorization: Bearer <token>
```

### Role-Based Access Control (RBAC)

Roles: `admin`, `manager`, `validator`, `support`, `viewer`

```typescript
// Require specific roles
router.delete('/threads/:id',
  authenticateRequest,
  requireRole('admin', 'manager'),
  deleteThread
);
```

## 🚢 Deployment

### Vercel

```bash
# Deploy to Vercel
vercel

# Set environment variables in Vercel dashboard
# Configure vercel.json for serverless functions
```

### Railway / Render

```bash
# Deploy as standard Node.js app
# Set environment variables
# Configure start command: npm start
```

### Docker

```bash
# Build image
docker build -t banxway-backend .

# Run container
docker run -p 8000:8000 --env-file .env banxway-backend
```

## 📝 Development Workflow

1. **Feature Branches**: Create feature branches from `main`
2. **Write Tests First**: Follow TDD approach
3. **Implement Feature**: Write minimum code to pass tests
4. **Code Review**: Submit PR for review
5. **Merge**: Merge to main after approval

## 🧪 Testing Strategy

- **Unit Tests**: Test individual functions/services
- **Integration Tests**: Test API endpoints with test database
- **E2E Tests**: Test complete workflows

```bash
# Example test
describe('ThreadRepository', () => {
  it('should create a new thread', async () => {
    const thread = await threadRepository.create({
      type: 'QUOTE_REQUEST',
      customer_id: 'customer-123',
      primary_channel: 'EMAIL',
    }, 'user-123');

    expect(thread).toBeDefined();
    expect(thread.reference).toMatch(/BX-\d{4}-\d{4}/);
  });
});
```

## 📚 Additional Documentation

- [API Documentation](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [WebSocket Guide](docs/WEBSOCKETS.md)
- [Agent Integration](docs/AGENTS.md)

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Test Supabase connection
curl "https://your-project.supabase.co/rest/v1/" \
  -H "apikey: your-anon-key"
```

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli ping
```

### Email Issues

```bash
# Test SMTP
npm run test:email
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

Proprietary - Banxway © 2024

## 🆘 Support

For issues and questions:
- Email: support@banxway.com
- Slack: #banxway-dev
- Documentation: https://docs.banxway.com

---

**Built with ❤️ by the Banxway Team**
