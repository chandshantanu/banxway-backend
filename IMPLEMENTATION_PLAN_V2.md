# Revised Implementation Plan V2: Multi-User Communication Hub

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              BANXWAY COMMUNICATION HUB                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                           USER ACCOUNTS                                  │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               │   │
│  │  │ User A        │  │ User B        │  │ User C        │               │   │
│  │  │ - Email: own  │  │ - Email: own  │  │ - Email: own  │               │   │
│  │  │ - Phone: +91X │  │ - Phone: +91Y │  │ - Phone: +91Z │               │   │
│  │  └───────────────┘  └───────────────┘  └───────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    ORGANIZATION SHARED                                   │   │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │   │
│  │  │         CENTRALIZED WHATSAPP (+91 XXXX XXXX)                      │  │   │
│  │  │         - All users can view/respond to WhatsApp                  │  │   │
│  │  │         - Conversations assigned to users/workflows               │  │   │
│  │  └───────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         LEAD / CUSTOMER                                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │ Excel Upload│  │ Click2Call  │  │ Zoho CRM    │  │ Odoo        │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    VISUAL WORKFLOW ENGINE (React Flow)                   │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │   │
│  │  │  [Trigger] → [Condition] → [Action] → [Escalation]              │    │   │
│  │  │     │             │            │            │                    │    │   │
│  │  │  New Lead    Check Time    Send Email   Notify Manager           │    │   │
│  │  │  New Call    Check Status  Send SMS     Create Task              │    │   │
│  │  │  New Email   Check Type    Make Call    Assign User              │    │   │
│  │  └─────────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### 1. User Email Accounts (Per-User)

```sql
-- Each user can connect their own email account
CREATE TABLE user_email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Provider info
  provider VARCHAR(50) NOT NULL DEFAULT 'zoho', -- 'zoho', 'gmail', 'outlook'
  email_address VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),

  -- Encrypted credentials
  credentials_encrypted TEXT NOT NULL,
  auth_method VARCHAR(50) NOT NULL, -- 'oauth', 'imap'

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,

  -- Settings
  sync_enabled BOOLEAN DEFAULT true,
  signature TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, email_address)
);

-- Email threads linked to user accounts
CREATE TABLE email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email_account_id UUID NOT NULL REFERENCES user_email_accounts(id),
  organization_id UUID NOT NULL,

  -- Thread info
  thread_id VARCHAR(255) NOT NULL, -- Provider's thread ID
  subject TEXT,
  snippet TEXT,

  -- Participants
  from_address VARCHAR(255),
  to_addresses JSONB,
  cc_addresses JSONB,

  -- Linking
  lead_id UUID REFERENCES leads(id),
  contact_id UUID REFERENCES contacts(id),

  -- Status
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  folder VARCHAR(100) DEFAULT 'inbox',

  -- Timestamps
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_email_account_id, thread_id)
);

-- Individual email messages
CREATE TABLE email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES email_threads(id),

  -- Message info
  message_id VARCHAR(255) NOT NULL,
  in_reply_to VARCHAR(255),

  -- Content
  from_address VARCHAR(255) NOT NULL,
  to_addresses JSONB NOT NULL,
  cc_addresses JSONB,
  bcc_addresses JSONB,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,

  -- Attachments
  attachments JSONB,

  -- Direction
  direction VARCHAR(20) NOT NULL, -- 'inbound', 'outbound'

  -- Status
  is_read BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. User Phone Numbers (Per-User, from Exotel Pool)

```sql
-- Organization's Exotel account (single for org)
CREATE TABLE organization_telephony_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id),

  -- Exotel credentials (encrypted)
  provider VARCHAR(50) NOT NULL DEFAULT 'exotel',
  credentials_encrypted TEXT NOT NULL,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Virtual numbers available to organization
CREATE TABLE organization_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  telephony_config_id UUID NOT NULL REFERENCES organization_telephony_config(id),

  -- Number info
  phone_number VARCHAR(20) NOT NULL,
  display_name VARCHAR(100),
  number_type VARCHAR(50), -- 'virtual', 'toll-free', 'local'

  -- Assignment
  assigned_to_user_id UUID REFERENCES users(id), -- NULL = unassigned/pool
  is_primary BOOLEAN DEFAULT false,

  -- Capabilities
  can_call BOOLEAN DEFAULT true,
  can_sms BOOLEAN DEFAULT true,

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, phone_number)
);

-- Call logs
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  phone_number_id UUID REFERENCES organization_phone_numbers(id),
  user_id UUID REFERENCES users(id), -- Who made/received the call

  -- Call details
  external_call_id VARCHAR(255), -- Exotel's call SID
  direction VARCHAR(20) NOT NULL, -- 'inbound', 'outbound'
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,

  -- Status
  status VARCHAR(50) NOT NULL, -- 'initiated', 'ringing', 'answered', 'completed', 'failed', 'busy', 'no-answer'
  duration_seconds INTEGER DEFAULT 0,

  -- Recording
  recording_url TEXT,
  recording_duration_seconds INTEGER,

  -- Linking
  lead_id UUID REFERENCES leads(id),
  contact_id UUID REFERENCES contacts(id),

  -- Timestamps
  initiated_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. Centralized WhatsApp (Organization-level)

```sql
-- Organization WhatsApp configuration (single for org)
CREATE TABLE organization_whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id),

  -- Exotel WhatsApp credentials (encrypted)
  credentials_encrypted TEXT NOT NULL,
  whatsapp_number VARCHAR(20) NOT NULL,
  business_name VARCHAR(255),

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,

  -- Settings
  auto_reply_enabled BOOLEAN DEFAULT false,
  auto_reply_message TEXT,
  business_hours JSONB, -- { "mon": { "start": "09:00", "end": "18:00" }, ... }

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WhatsApp conversations (shared across org)
CREATE TABLE whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  whatsapp_config_id UUID NOT NULL REFERENCES organization_whatsapp_config(id),

  -- Contact
  contact_phone VARCHAR(20) NOT NULL,
  contact_name VARCHAR(255),
  contact_profile_pic_url TEXT,

  -- Assignment
  assigned_to_user_id UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ,

  -- Linking
  lead_id UUID REFERENCES leads(id),
  contact_id UUID REFERENCES contacts(id),

  -- Status
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'resolved', 'pending', 'spam'
  is_read BOOLEAN DEFAULT false,
  unread_count INTEGER DEFAULT 0,

  -- Timestamps
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, contact_phone)
);

-- WhatsApp messages
CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id),

  -- Message details
  external_message_id VARCHAR(255), -- Exotel's message ID
  direction VARCHAR(20) NOT NULL, -- 'inbound', 'outbound'

  -- Content
  message_type VARCHAR(50) NOT NULL, -- 'text', 'image', 'document', 'audio', 'video', 'template'
  content TEXT,
  media_url TEXT,
  media_type VARCHAR(100),

  -- Template (for outbound)
  template_name VARCHAR(255),
  template_params JSONB,

  -- Status
  status VARCHAR(50) DEFAULT 'sent', -- 'pending', 'sent', 'delivered', 'read', 'failed'
  error_message TEXT,

  -- Sender (for outbound, which user sent it)
  sent_by_user_id UUID REFERENCES users(id),

  -- Timestamps
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. Leads & Contacts (Unified Communication Linking)

```sql
-- Leads table (from Excel, Click2Call, CRM)
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Lead info
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  company VARCHAR(255),

  -- Source
  source VARCHAR(100) NOT NULL, -- 'excel_upload', 'click_to_call', 'zoho_crm', 'odoo', 'whatsapp', 'email', 'manual'
  source_reference VARCHAR(255), -- External ID from source system

  -- Assignment
  assigned_to_user_id UUID REFERENCES users(id),

  -- Status
  status VARCHAR(50) DEFAULT 'new', -- 'new', 'contacted', 'qualified', 'converted', 'lost'

  -- Workflow
  current_workflow_id UUID, -- Active workflow assignment
  workflow_stage VARCHAR(100),

  -- Custom fields
  custom_fields JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track all communications for a lead
CREATE TABLE lead_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id),

  -- Communication type
  communication_type VARCHAR(50) NOT NULL, -- 'email', 'call', 'whatsapp', 'sms'

  -- Reference to actual communication
  email_thread_id UUID REFERENCES email_threads(id),
  call_log_id UUID REFERENCES call_logs(id),
  whatsapp_conversation_id UUID REFERENCES whatsapp_conversations(id),

  -- Summary (for quick display)
  summary TEXT,
  direction VARCHAR(20), -- 'inbound', 'outbound'

  -- Timestamps
  communication_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5. Workflow Engine (React Flow)

```sql
-- Workflow definitions
CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Info
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- React Flow data
  nodes JSONB NOT NULL, -- Array of nodes
  edges JSONB NOT NULL, -- Array of connections

  -- Trigger config
  trigger_type VARCHAR(50), -- 'manual', 'new_lead', 'new_call', 'new_email', 'new_whatsapp', 'schedule'
  trigger_config JSONB,

  -- Status
  is_active BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,

  -- Audit
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow executions (instances running for leads)
CREATE TABLE workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id),

  -- Context
  lead_id UUID REFERENCES leads(id),
  contact_id UUID REFERENCES contacts(id),

  -- State
  current_node_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'running', -- 'running', 'paused', 'completed', 'failed', 'cancelled'
  context JSONB, -- Variables and state

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow execution history (audit trail)
CREATE TABLE workflow_execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id),

  -- Node info
  node_id VARCHAR(255) NOT NULL,
  node_type VARCHAR(50) NOT NULL,
  node_config JSONB,

  -- Result
  status VARCHAR(50) NOT NULL, -- 'pending', 'running', 'completed', 'failed', 'skipped'
  result JSONB,
  error TEXT,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Current Focus)
1. Database migrations
2. Encryption service
3. Base API structure

### Phase 2: User Email Management
1. Email account connection UI (per-user)
2. Zoho OAuth flow
3. Email sync service
4. Email thread viewer

### Phase 3: Phone Management
1. Admin Exotel configuration
2. Phone number assignment to users
3. Click-to-call integration
4. Call logs viewer

### Phase 4: WhatsApp Hub
1. Admin WhatsApp configuration
2. Shared conversation inbox
3. User assignment
4. Auto-reply settings

### Phase 5: Lead Management
1. Excel upload
2. Manual lead creation
3. Communication linking
4. CRM integration (Zoho/Odoo)

### Phase 6: Workflow Builder (React Flow)
1. Workflow designer UI
2. Node types (triggers, conditions, actions)
3. Workflow execution engine
4. Escalation handling

---

## File Structure

```
banxway-backend/
├── src/
│   ├── db/
│   │   └── migrations/
│   │       ├── 001_integrations_base.sql
│   │       ├── 002_user_email_accounts.sql
│   │       ├── 003_phone_numbers.sql
│   │       ├── 004_whatsapp.sql
│   │       ├── 005_leads.sql
│   │       └── 006_workflows.sql
│   ├── services/
│   │   ├── encryption.service.ts
│   │   ├── email/
│   │   │   ├── zoho.service.ts
│   │   │   ├── sync.service.ts
│   │   │   └── index.ts
│   │   ├── telephony/
│   │   │   ├── exotel.service.ts
│   │   │   ├── call.service.ts
│   │   │   └── index.ts
│   │   ├── whatsapp/
│   │   │   ├── exotel-wa.service.ts
│   │   │   └── index.ts
│   │   ├── leads/
│   │   │   ├── lead.service.ts
│   │   │   ├── excel-import.service.ts
│   │   │   └── index.ts
│   │   └── workflows/
│   │       ├── workflow.service.ts
│   │       ├── executor.service.ts
│   │       ├── nodes/
│   │       │   ├── trigger-nodes.ts
│   │       │   ├── condition-nodes.ts
│   │       │   └── action-nodes.ts
│   │       └── index.ts
│   └── api/v1/
│       ├── routes/
│       │   ├── email-accounts.routes.ts
│       │   ├── phone.routes.ts
│       │   ├── whatsapp.routes.ts
│       │   ├── leads.routes.ts
│       │   └── workflows.routes.ts
│       └── controllers/
│           └── ...

banxway-platform/
├── src/
│   ├── app/(dashboard)/
│   │   ├── settings/
│   │   │   ├── email-accounts/
│   │   │   │   └── page.tsx        # User's email account management
│   │   │   ├── integrations/
│   │   │   │   └── page.tsx        # Admin: Exotel, WhatsApp config
│   │   │   └── team/
│   │   │       └── page.tsx        # Team & phone number assignment
│   │   ├── inbox/
│   │   │   ├── page.tsx            # Unified inbox (email, whatsapp)
│   │   │   └── [type]/[id]/
│   │   │       └── page.tsx        # Thread view
│   │   ├── calls/
│   │   │   └── page.tsx            # Call logs
│   │   ├── leads/
│   │   │   ├── page.tsx            # Lead list
│   │   │   ├── import/
│   │   │   │   └── page.tsx        # Excel import
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Lead detail with all comms
│   │   └── workflows/
│   │       ├── page.tsx            # Workflow list
│   │       └── [id]/
│   │           └── page.tsx        # React Flow builder
│   └── components/
│       ├── email/
│       │   ├── connect-account-dialog.tsx
│       │   ├── thread-list.tsx
│       │   └── thread-viewer.tsx
│       ├── whatsapp/
│       │   ├── conversation-list.tsx
│       │   └── chat-window.tsx
│       ├── calls/
│       │   ├── call-log-list.tsx
│       │   └── click-to-call-button.tsx
│       ├── leads/
│       │   ├── lead-card.tsx
│       │   └── excel-uploader.tsx
│       └── workflows/
│           ├── flow-canvas.tsx
│           └── node-types/
│               ├── trigger-node.tsx
│               ├── condition-node.tsx
│               └── action-node.tsx
```

---

## Immediate Implementation: Phase 1 Files

Let me now implement the core files needed to get started:

1. **Database migration** - Core tables
2. **Encryption service** - AES-256 encryption
3. **Email account routes & controller** - User email management
4. **Settings/email-accounts page** - User connects their email
5. **Fix connection buttons** - Route to correct pages
6. **Create missing pages** - /requests, /settings/team, /settings/integrations
7. **Enhanced error handling** - 401/403/404 handling

---

## Connection Button Destinations (Updated)

| Button | Destination | Description |
|--------|-------------|-------------|
| Email "Connect now" | `/settings/email-accounts` | User connects their own email |
| WhatsApp "Connect now" | `/settings/integrations?tab=whatsapp` | Admin configures org WhatsApp |
| Phone "Phone Calls" | `/settings/team` | Admin assigns phone numbers |

---

## What to Implement Now

Based on this architecture, here's what we should implement immediately:

1. **User Email Account Management**
   - `/settings/email-accounts` page
   - Connect Zoho account flow (OAuth + IMAP options)
   - Email thread viewing

2. **Admin Integrations Page**
   - `/settings/integrations` for Exotel Phone/WhatsApp
   - Organization-level configuration

3. **Team & Phone Assignment**
   - `/settings/team` page
   - Phone number assignment to users

4. **Fix Navigation**
   - Update connection buttons
   - Create `/requests` page

5. **Error Handling**
   - Enhanced API error handling
   - Auth error listener
