# Banxway Backend - Implementation Guide

## ✅ What Has Been Implemented

### Phase 1: Core Infrastructure ✓

#### Project Structure
- Complete folder hierarchy created
- All necessary directories for API, services, workers, config, etc.
- TypeScript configuration with strict mode
- Package.json with all dependencies

#### Configuration Files ✓
- ✅ `config/database.config.ts` - Supabase client setup
- ✅ `config/redis.config.ts` - Redis + BullMQ queue setup
- ✅ `config/email.config.ts` - SMTP/IMAP configuration
- ✅ `config/exotel.config.ts` - Exotel API configuration
- ✅ `config/ai.config.ts` - OpenAI/Anthropic configuration
- ✅ `config/agent.config.ts` - AgentBuilder MCP configuration

#### Types & Utilities ✓
- ✅ `types/index.ts` - Complete TypeScript definitions for all entities
- ✅ `utils/logger.ts` - Winston logger with file rotation
- ✅ `utils/validation.ts` - Zod validation helpers
- ✅ `utils/helpers.ts` - General utility functions
- ✅ `utils/email-parser.ts` - Email parsing with mailparser

#### Middleware ✓
- ✅ `middleware/auth.middleware.ts` - JWT authentication with Supabase
- ✅ `middleware/error.middleware.ts` - Global error handler
- ✅ `middleware/logger.middleware.ts` - Request/response logging
- ✅ `middleware/rate-limit.middleware.ts` - Rate limiting
- ✅ `middleware/cors.middleware.ts` - CORS configuration

#### Database ✓
- ✅ `database/migrations/001_initial_schema.sql` - Complete schema with:
  - All 12 core tables
  - Indexes for performance
  - Triggers for auto-updates
  - Row Level Security policies
- ✅ `database/repositories/thread.repository.ts` - Thread data access layer

#### Express Server ✓
- ✅ `index.ts` - Main Express app with:
  - All middleware configured
  - Health check endpoint
  - WebSocket server integration
  - Graceful shutdown handlers
  - Worker initialization

#### API Routes ✓
- ✅ `api/v1/index.ts` - Main API router
- ✅ `api/v1/communications/threads.ts` - Full CRUD for threads
- ✅ Placeholder routes for all other endpoints (messages, shipments, etc.)

#### WebSocket ✓
- ✅ `websocket/server.ts` - Complete WebSocket implementation:
  - Authentication
  - Room management (thread:id, user:id)
  - Typing indicators
  - Presence tracking
  - Event emitters

#### Background Workers ✓
- ✅ `workers/email-poller.worker.ts` - IMAP email polling:
  - Fetches unseen emails
  - Parses email content
  - Creates threads/messages
  - Emits WebSocket events
- ✅ `workers/whatsapp-processor.worker.ts` - WhatsApp message handler (placeholder)
- ✅ `workers/sla-checker.worker.ts` - SLA monitoring (placeholder)

#### Documentation ✓
- ✅ `README.md` - Comprehensive project documentation
- ✅ `.env.example` - Environment variable template
- ✅ `docker-compose.yml` - Local development setup
- ✅ `vercel.json` - Vercel deployment configuration

---

## 🚧 What Still Needs Implementation

### Phase 2: Complete Communication System

#### Database Repositories (Priority: HIGH)
Create repository files for:
- [ ] `database/repositories/message.repository.ts`
- [ ] `database/repositories/action.repository.ts`
- [ ] `database/repositories/customer.repository.ts`
- [ ] `database/repositories/shipment.repository.ts`
- [ ] `database/repositories/workflow.repository.ts`
- [ ] `database/repositories/notification.repository.ts`

#### Communication Services (Priority: HIGH)
- [ ] `services/communication/message.service.ts`
- [ ] `services/communication/action.service.ts`
- [ ] Complete API endpoints in:
  - [ ] `api/v1/communications/messages.ts`
  - [ ] `api/v1/communications/actions.ts`
  - [ ] `api/v1/communications/notes.ts`

#### Email Service (Priority: HIGH)
- [ ] `services/email/email.service.ts` - Nodemailer integration for sending
- [ ] Complete email threading logic
- [ ] Attachment upload to Supabase Storage

### Phase 3: Multi-Channel Support

#### WhatsApp Integration (Priority: MEDIUM)
- [ ] `services/whatsapp/whatsapp.service.ts`
- [ ] `services/whatsapp/exotel-client.ts`
- [ ] Complete `api/v1/webhooks/index.ts` for Exotel callbacks
- [ ] Complete `workers/whatsapp-processor.worker.ts`

#### SMS Integration (Priority: MEDIUM)
- [ ] `services/sms/sms.service.ts`
- [ ] Exotel SMS API integration

#### Voice Integration (Priority: LOW)
- [ ] `services/voice/call.service.ts`
- [ ] `services/voice/transcription.service.ts`

### Phase 4: AI Features

#### Intelligent Compose (Priority: HIGH)
- [ ] `services/compose/suggestion.service.ts`
- [ ] `services/compose/context-aggregator.ts`
- [ ] `services/compose/draft-generator.ts`
- [ ] `services/ai/openai.service.ts`
- [ ] `services/ai/prompt-templates.ts`
- [ ] Complete `api/v1/compose/index.ts` with SSE streaming

#### AI Data Extraction (Priority: MEDIUM)
- [ ] Create worker for message analysis
- [ ] Implement sentiment analysis
- [ ] Implement intent detection
- [ ] Extract structured data from messages

### Phase 5: Workflow Engine

#### Workflow System (Priority: MEDIUM)
- [ ] `services/workflow/workflow-engine.ts`
- [ ] `services/workflow/workflow-matcher.ts`
- [ ] `services/workflow/action-orchestrator.ts`
- [ ] Complete `api/v1/workflows/index.ts`

### Phase 6: Agent Integration

#### AgentBuilder MCP (Priority: MEDIUM)
- [ ] `services/agent/agent-coordinator.ts`
- [ ] `services/agent/websocket-client.ts`
- [ ] `services/agent/mcp-client.ts`
- [ ] Agent task queue worker

### Phase 7: Additional Features

#### Shipments (Priority: MEDIUM)
- [ ] Complete `api/v1/shipments/index.ts`
- [ ] Document management
- [ ] Milestone tracking

#### Users & Customers (Priority: MEDIUM)
- [ ] Complete `api/v1/users/index.ts`
- [ ] Complete `api/v1/customers/index.ts`
- [ ] Contact management

#### Notifications (Priority: MEDIUM)
- [ ] Complete `api/v1/notifications/index.ts`
- [ ] Real-time notification delivery
- [ ] Email/SMS notifications

#### Analytics (Priority: LOW)
- [ ] Complete `api/v1/analytics/index.ts`
- [ ] `services/analytics/metrics.service.ts`
- [ ] Dashboard aggregation worker

#### Documents (Priority: LOW)
- [ ] `services/storage/file.service.ts`
- [ ] `services/storage/document.service.ts`
- [ ] OCR processing worker
- [ ] Complete `api/v1/documents/index.ts`

---

## 🚀 How to Continue Development

### Step 1: Setup Development Environment

```bash
# Navigate to backend directory
cd /Users/shantanuchandra/code/banxway/platform/banxway-backend

# Install dependencies
npm install

# Start local services
docker-compose up -d

# Copy and configure environment
cp .env.example .env
nano .env
```

### Step 2: Run Database Migrations

```bash
# Option A: Using Supabase CLI
supabase db push

# Option B: Manual execution
psql -h your-db-host -U postgres -d banxway < src/database/migrations/001_initial_schema.sql
```

### Step 3: Start Development Server

```bash
# Start in development mode with hot reload
npm run dev

# Server will start on http://localhost:8000
# WebSocket on ws://localhost:8000
```

### Step 4: Test Basic Endpoints

```bash
# Health check
curl http://localhost:8000/health

# API info
curl http://localhost:8000/api/v1

# Test threads endpoint (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/communications/threads
```

### Step 5: Implement Missing Features

Follow the TDD approach outlined in CLAUDE.md:

1. **Write Tests First**
   ```bash
   # Create test file
   touch tests/unit/services/message.service.test.ts
   ```

2. **Write Tests**
   ```typescript
   describe('MessageService', () => {
     it('should send a message', async () => {
       const message = await messageService.send({
         threadId: 'thread-123',
         content: 'Test message',
         channel: 'EMAIL',
       });
       expect(message).toBeDefined();
     });
   });
   ```

3. **Implement Service**
   ```bash
   # Create service file
   touch src/services/communication/message.service.ts
   ```

4. **Run Tests**
   ```bash
   npm test
   ```

5. **Repeat for Each Feature**

### Implementation Pattern Example

Here's a complete pattern for implementing a new feature:

#### 1. Create Repository
```typescript
// src/database/repositories/message.repository.ts
import { supabaseAdmin } from '../../config/database.config';
import { CommunicationMessage } from '../../types';

export class MessageRepository {
  async findByThreadId(threadId: string) {
    const { data, error } = await supabaseAdmin
      .from('communication_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as CommunicationMessage[];
  }

  async create(messageData: any) {
    const { data, error } = await supabaseAdmin
      .from('communication_messages')
      .insert(messageData)
      .select()
      .single();

    if (error) throw error;
    return data as CommunicationMessage;
  }
}

export default new MessageRepository();
```

#### 2. Create Service
```typescript
// src/services/communication/message.service.ts
import messageRepository from '../../database/repositories/message.repository';
import { io } from '../../index';

export class MessageService {
  async sendMessage(threadId: string, content: string, channel: string) {
    const message = await messageRepository.create({
      thread_id: threadId,
      content,
      channel,
      direction: 'OUTBOUND',
    });

    // Emit WebSocket event
    io.to(`thread:${threadId}`).emit('thread:message', {
      threadId,
      message,
    });

    return message;
  }
}

export default new MessageService();
```

#### 3. Create API Endpoint
```typescript
// src/api/v1/communications/messages.ts
import { Router } from 'express';
import messageService from '../../../services/communication/message.service';

const router = Router();

router.post('/', async (req, res) => {
  const { threadId, content, channel } = req.body;
  const message = await messageService.sendMessage(threadId, content, channel);
  res.json({ success: true, data: message });
});

export default router;
```

---

## 📝 Recommended Implementation Order

### Week 1: Complete Communication Core
1. Message repository & service
2. Message API endpoints
3. Action repository & service
4. Action API endpoints
5. Email sending with Nodemailer

### Week 2: Multi-Channel Support
1. WhatsApp webhook handler
2. WhatsApp service for sending
3. SMS service
4. Test all channels end-to-end

### Week 3: AI Features
1. OpenAI service setup
2. Context aggregation
3. Draft generation
4. SSE streaming endpoint
5. Message analysis worker

### Week 4: Workflow & Agents
1. Workflow engine
2. Workflow API endpoints
3. AgentBuilder MCP client
4. Agent coordination service

### Week 5: Additional Features
1. Complete shipments module
2. Complete users/customers module
3. Notifications system
4. Analytics basics

### Week 6: Testing & Polish
1. Write comprehensive tests
2. Fix bugs
3. Optimize performance
4. Documentation updates

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Repository tests for all entities
- [ ] Service tests with mocked dependencies
- [ ] Utility function tests
- [ ] Middleware tests

### Integration Tests
- [ ] API endpoint tests
- [ ] Database integration tests
- [ ] Email sending/receiving tests
- [ ] WebSocket connection tests

### E2E Tests
- [ ] Complete email flow (receive → process → respond)
- [ ] WhatsApp message flow
- [ ] Workflow execution
- [ ] Multi-channel thread handling

---

## 🐛 Known Issues & TODOs

### Critical
- [ ] Add proper error handling for all async operations
- [ ] Implement request validation for all endpoints
- [ ] Add database transaction support for complex operations
- [ ] Implement proper file upload handling with size limits

### Important
- [ ] Add rate limiting per user (currently global)
- [ ] Implement proper logging rotation
- [ ] Add metrics collection (Prometheus)
- [ ] Setup monitoring alerts

### Nice to Have
- [ ] Add API versioning support
- [ ] Implement caching layer (Redis)
- [ ] Add request/response compression
- [ ] Setup API documentation (Swagger/OpenAPI)

---

## 📚 Additional Resources

### Documentation to Create
- [ ] `docs/API.md` - Complete API documentation
- [ ] `docs/DEPLOYMENT.md` - Deployment guide
- [ ] `docs/ARCHITECTURE.md` - Architecture decisions
- [ ] `docs/WEBSOCKETS.md` - WebSocket event reference
- [ ] `docs/AGENTS.md` - Agent integration guide

### Scripts to Create
- [ ] `scripts/migrate.ts` - Database migration runner
- [ ] `scripts/seed.ts` - Database seeding
- [ ] `scripts/generate-types.ts` - Generate types from Supabase

---

## 🆘 Getting Help

If you encounter issues:

1. **Check Logs**: `tail -f logs/combined.log`
2. **Test Database**: Verify Supabase connection
3. **Test Redis**: `redis-cli ping`
4. **Check Workers**: Ensure BullMQ queues are processing
5. **Review Config**: Verify all environment variables are set

---

**Remember**: Follow TDD principles, write tests first, keep commits small and focused, and ask for code review before merging to main.

Good luck with the implementation! 🚀
