# Visual Workflow Builder - Complete Guide

## 🎯 Overview

The Banxway Visual Workflow Builder is a powerful tool for creating automated logistics workflows with:
- **Visual drag-and-drop interface** for building workflows
- **AI-powered workflow matching** using LLM to auto-assign workflows to shipments
- **Multi-channel communication** (Email, WhatsApp, SMS, Voice) via Exotel
- **TAT & SLA management** with automatic escalations
- **Real-time execution tracking** with WebSocket updates

---

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WORKFLOW BUILDER UI                       │
│              (React Flow / Drag & Drop)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ REST API
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              WORKFLOW BUILDER BACKEND                        │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Workflow Definition API                            │    │
│  │  - Create/Update/Delete workflows                   │    │
│  │  - Publish workflows                                │    │
│  │  - Manage templates                                 │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Workflow Execution Engine                          │    │
│  │  - Start workflow instances                         │    │
│  │  - Execute nodes sequentially                       │    │
│  │  - Handle conditions & branches                     │    │
│  │  - Track execution state                            │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  LLM Workflow Matcher (OpenAI)                      │    │
│  │  - Analyze shipment characteristics                 │    │
│  │  - Match to best workflow (0-100 score)             │    │
│  │  - Auto-assign workflows                            │    │
│  │  - Generate improvement suggestions                 │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Exotel Integration                                 │    │
│  │  - Voice calls (Click-to-Call)                      │    │
│  │  - WhatsApp messages                                │    │
│  │  - SMS notifications                                │    │
│  │  - Webhook handlers                                 │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧩 Workflow Components

### Node Types

#### 1. **Control Flow Nodes**
- `START` - Workflow entry point with triggers
- `END` - Workflow completion with outcomes
- `CONDITION` - Branch based on data conditions
- `APPROVAL` - Wait for user approval

#### 2. **Communication Nodes**
- `SEND_EMAIL` - Send email via SMTP
- `SEND_WHATSAPP` - Send WhatsApp via Exotel
- `SEND_SMS` - Send SMS via Exotel
- `MAKE_CALL` - Initiate voice call via Exotel
- `SEND_NOTIFICATION` - Internal notifications

#### 3. **Action Nodes**
- `CREATE_TASK` - Create action item
- `UPDATE_SHIPMENT` - Update shipment status
- `ESCALATE` - Escalate to manager
- `ASSIGN` - Assign to user/team

#### 4. **Data Nodes**
- `EXTRACT_DATA` - Extract from messages/documents
- `VALIDATE_DATA` - Validate required fields
- `TRANSFORM_DATA` - Transform/map data

#### 5. **AI Nodes**
- `AI_CLASSIFICATION` - Classify using LLM
- `AI_EXTRACTION` - Extract entities using LLM
- `AI_DECISION` - Make decisions using LLM

#### 6. **Time Nodes**
- `DELAY` - Wait for specified time
- `SCHEDULE` - Schedule for specific time
- `WAIT_FOR_EVENT` - Wait for external event

#### 7. **Integration Nodes**
- `API_CALL` - Call external API
- `WEBHOOK` - Trigger webhook
- `DATABASE_QUERY` - Query database

### Triggers

Workflows can be triggered by:
- `MANUAL` - Manually started
- `SHIPMENT_CREATED` - New shipment created
- `SHIPMENT_STATUS_CHANGE` - Shipment status updated
- `MESSAGE_RECEIVED` - New message received
- `DOCUMENT_UPLOADED` - Document uploaded
- `SLA_BREACH` - SLA deadline breached
- `TAT_WARNING` - TAT warning threshold reached
- `SCHEDULED` - Cron-based schedule
- `WEBHOOK` - External webhook

---

## 🚀 Quick Start

### 1. Create a Workflow

```typescript
POST /api/v1/workflows/builder

{
  "name": "Quote Request Handling",
  "description": "Automated quote processing",
  "category": "QUOTE_REQUEST",
  "nodes": [
    {
      "id": "start-1",
      "type": "START",
      "label": "Quote Received",
      "position": { "x": 100, "y": 100 },
      "config": {
        "type": "START",
        "trigger": "MESSAGE_RECEIVED"
      }
    },
    {
      "id": "task-1",
      "type": "CREATE_TASK",
      "label": "Assign to Sales",
      "position": { "x": 100, "y": 200 },
      "config": {
        "type": "CREATE_TASK",
        "title": "Prepare Quote",
        "priority": "HIGH",
        "taskType": "PREPARE_QUOTE",
        "dueInMinutes": 240
      }
    },
    {
      "id": "end-1",
      "type": "END",
      "label": "Complete",
      "position": { "x": 100, "y": 300 },
      "config": {
        "type": "END",
        "outcome": "SUCCESS"
      }
    }
  ],
  "edges": [
    { "id": "e1", "source": "start-1", "target": "task-1" },
    { "id": "e2", "source": "task-1", "target": "end-1" }
  ],
  "tags": ["quote", "sales"],
  "serviceTypes": ["SEA_FCL", "AIR"],
  "customerTiers": ["PREMIUM", "STANDARD"]
}
```

### 2. Publish Workflow

```typescript
POST /api/v1/workflows/builder/{workflowId}/publish
```

### 3. Auto-Assign to Shipment

```typescript
POST /api/v1/workflows/builder/auto-assign/{shipmentId}

{
  "threshold": 70  // Minimum match score (0-100)
}
```

The LLM will analyze the shipment and automatically assign the best matching workflow!

---

## 🤖 LLM Workflow Matching

### How It Works

1. **Shipment Analysis**: LLM analyzes shipment characteristics
   - Service type (SEA_FCL, AIR, etc.)
   - Origin/destination countries
   - Cargo type
   - Customer tier
   - Special requirements

2. **Workflow Comparison**: Compares against all active workflows
   - Workflow category and purpose
   - Configured service types
   - Customer tier requirements
   - Historical performance

3. **Matching Score**: Returns 0-100 match score with reasoning
   ```json
   {
     "workflowId": "uuid",
     "workflowName": "Quote Request Handling",
     "matchScore": 85,
     "matchReason": "High match due to service type SEA_FCL and premium customer tier",
     "confidence": 0.92,
     "suggestedVariables": {
       "responseTime": "4 hours",
       "assignTo": "senior_sales"
     }
   }
   ```

4. **Auto-Assignment**: If score >= threshold, workflow is automatically started

### Match Workflow Manually

```typescript
POST /api/v1/workflows/builder/match

{
  "shipment": {
    "serviceType": "SEA_FCL",
    "originCountry": "China",
    "destinationCountry": "USA",
    "cargoType": "Electronics"
  },
  "customer": {
    "tier": "PREMIUM",
    "industry": "Technology"
  },
  "context": "Customer requires expedited processing"
}
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "workflowId": "abc-123",
      "workflowName": "Premium FCL Handling",
      "matchScore": 92,
      "matchReason": "Perfect match for premium FCL shipments with expedited service",
      "confidence": 0.95
    },
    {
      "workflowId": "def-456",
      "workflowName": "Standard FCL Process",
      "matchScore": 75,
      "matchReason": "Good match for FCL shipments, but not optimized for premium tier",
      "confidence": 0.85
    }
  ]
}
```

---

## 📞 Exotel Integration

### Voice Calls (Click-to-Call)

```typescript
// In workflow node config
{
  "type": "MAKE_CALL",
  "from": "{{virtualNumber}}",
  "to": "{{customer.phone}}",
  "callType": "C2C",
  "recording": true,
  "maxDuration": 3600,
  "metadata": {
    "purpose": "Follow-up",
    "shipmentRef": "{{shipment.reference}}"
  }
}
```

**Webhook Endpoint**: `POST /api/v1/webhooks/exotel/call`

Webhook payload:
```json
{
  "CallSid": "CA123...",
  "CallStatus": "completed",
  "Direction": "outbound",
  "From": "+1234567890",
  "To": "+0987654321",
  "CallDuration": "145",
  "RecordingUrl": "https://..."
}
```

### WhatsApp Messages

```typescript
// In workflow node config
{
  "type": "SEND_WHATSAPP",
  "from": "{{whatsappNumber}}",
  "to": "{{customer.phone}}",
  "messageType": "text",
  "content": {
    "text": "Dear {{customer.name}}, your shipment {{shipment.reference}} has been updated."
  }
}
```

**Send Document**:
```typescript
{
  "messageType": "document",
  "content": {
    "documentUrl": "https://example.com/invoice.pdf",
    "filename": "Invoice.pdf",
    "caption": "Your invoice for shipment {{shipment.reference}}"
  }
}
```

**Send Location**:
```typescript
{
  "messageType": "location",
  "content": {
    "latitude": "37.758056",
    "longitude": "-122.425332",
    "name": "Port of Oakland",
    "address": "Oakland, CA"
  }
}
```

**Webhook Endpoint**: `POST /api/v1/webhooks/exotel/whatsapp`

### SMS Notifications

```typescript
{
  "type": "SEND_SMS",
  "from": "{{smsNumber}}",
  "to": "{{customer.phone}}",
  "message": "Shipment {{shipment.reference}} update: {{status}}",
  "template": "shipment_update"
}
```

---

## 🔄 Workflow Execution

### Start Workflow

```typescript
POST /api/v1/workflows/builder/execute

{
  "workflowDefinitionId": "workflow-uuid",
  "entityType": "SHIPMENT",
  "shipmentId": "shipment-uuid",
  "initialContext": {
    "customer": {
      "name": "John Doe",
      "phone": "+1234567890",
      "email": "john@example.com",
      "tier": "PREMIUM"
    },
    "shipment": {
      "reference": "BX-2024-0001",
      "serviceType": "SEA_FCL",
      "status": "BOOKED"
    }
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "instance-uuid",
    "workflowDefinitionId": "workflow-uuid",
    "status": "IN_PROGRESS",
    "currentNodeId": "task-1",
    "currentStepNumber": 2,
    "totalSteps": 5,
    "startedAt": "2024-01-20T10:00:00Z"
  }
}
```

### Track Execution

```typescript
GET /api/v1/workflows/builder/instances/{instanceId}
```

Response includes:
- Current execution state
- Execution log (all completed nodes)
- Errors (if any)
- Variables and context
- Estimated completion time

### WebSocket Updates

```typescript
// Subscribe to workflow updates
socket.emit('workflow:subscribe', { instanceId: 'instance-uuid' });

// Receive updates
socket.on('workflow:step_completed', (data) => {
  console.log('Step completed:', data.nodeId);
});

socket.on('workflow:completed', (data) => {
  console.log('Workflow completed:', data.outcome);
});
```

---

## 📊 Workflow Analytics

### Performance Metrics

```typescript
GET /api/v1/workflows/builder/{workflowId}/performance
```

Response:
```json
{
  "success": true,
  "data": {
    "totalExecutions": 150,
    "successRate": 94.67,
    "avgCompletionTime": 245.5,  // minutes
    "commonFailurePoints": ["node-3", "node-7"],
    "suggestions": [
      "Consider adding retry logic to node-3",
      "Increase timeout for external API calls",
      "Add fallback email when WhatsApp fails"
    ]
  }
}
```

The LLM analyzes workflow performance and provides actionable suggestions!

---

## 🎨 Pre-Built Templates

### Available Templates

1. **Quote Request Handling**
   - Auto-extract quote details
   - Assign to sales team
   - 24-hour follow-up
   - Manager escalation

2. **Booking Confirmation & Documentation**
   - WhatsApp confirmation
   - Email document list
   - 48-hour follow-up task

3. **Shipment Tracking Updates**
   - Conditional notifications (tier-based)
   - Premium: WhatsApp
   - Standard: Email

4. **Exception Handling**
   - Urgent task creation
   - Customer call (premium)
   - WhatsApp notification
   - Manager escalation

5. **Customs Clearance**
   - Document verification
   - Missing document requests
   - Customs submission task

### Use Template

```typescript
POST /api/v1/workflows/builder/from-template

{
  "templateName": "Quote Request Handling",
  "customizations": {
    "assignTo": "sales_team_1",
    "responseTimeHours": 4
  }
}
```

---

## 🔧 Advanced Features

### Template Variables

Use `{{variable}}` syntax in any text field:

```
Dear {{customer.name}},

Your shipment {{shipment.reference}} from {{shipment.origin}}
to {{shipment.destination}} has been {{shipment.status}}.

Estimated arrival: {{shipment.estimatedArrival}}
```

Available variables:
- `{{customer.*}}` - Customer fields
- `{{shipment.*}}` - Shipment fields
- `{{thread.*}}` - Thread fields
- `{{workflow.*}}` - Workflow context
- `{{user.*}}` - Current user

### Conditional Logic

```typescript
{
  "type": "CONDITION",
  "conditions": [
    {
      "field": "customer.tier",
      "operator": "equals",
      "value": "PREMIUM"
    },
    {
      "field": "shipment.value",
      "operator": "greater_than",
      "value": 50000
    }
  ],
  "logic": "AND",
  "branches": {
    "true": "premium-flow",
    "false": "standard-flow"
  }
}
```

Operators: `equals`, `not_equals`, `greater_than`, `less_than`, `contains`, `in`, `not_in`

### SLA & TAT Configuration

```typescript
{
  "slaConfig": {
    "responseTimeMinutes": 240,      // 4 hours
    "resolutionTimeMinutes": 2880,   // 48 hours
    "escalationRules": [
      {
        "afterMinutes": 192,          // 80% of response time
        "escalateTo": ["team_lead"],
        "notifyVia": ["EMAIL"]
      },
      {
        "afterMinutes": 240,          // 100% - SLA breach
        "escalateTo": ["manager"],
        "notifyVia": ["EMAIL", "WHATSAPP", "CALL"]
      }
    ]
  }
}
```

---

## 📝 API Reference

### Workflow Definitions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/workflows/builder` | GET | List workflows |
| `/workflows/builder` | POST | Create workflow |
| `/workflows/builder/:id` | GET | Get workflow |
| `/workflows/builder/:id` | PATCH | Update workflow |
| `/workflows/builder/:id` | DELETE | Delete workflow |
| `/workflows/builder/:id/publish` | POST | Publish workflow |
| `/workflows/builder/:id/duplicate` | POST | Duplicate workflow |
| `/workflows/builder/:id/performance` | GET | Get analytics |

### Workflow Execution

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/workflows/builder/execute` | POST | Start workflow |
| `/workflows/builder/instances` | GET | List instances |
| `/workflows/builder/instances/:id` | GET | Get instance |

### Workflow Matching

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/workflows/builder/match` | POST | Match workflows |
| `/workflows/builder/auto-assign/:shipmentId` | POST | Auto-assign |
| `/workflows/builder/suggest-for-thread/:threadId` | GET | Suggest for thread |

### Webhooks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhooks/exotel/call` | POST | Exotel call webhook |
| `/webhooks/exotel/whatsapp` | POST | Exotel WhatsApp webhook |

---

## 🎯 Best Practices

### 1. Design Workflows for Reusability
- Use template variables instead of hardcoded values
- Make workflows category-specific
- Configure service types and tiers

### 2. Handle Failures Gracefully
- Add error handling nodes
- Set reasonable timeouts
- Implement retry logic
- Use fallback communication channels

### 3. Optimize Performance
- Keep workflows focused (5-10 nodes)
- Avoid unnecessary delays
- Use conditions to skip irrelevant steps
- Monitor execution times

### 4. Test Before Publishing
- Create draft workflows first
- Test with sample data
- Verify all integrations
- Check template variables

### 5. Monitor and Improve
- Review performance metrics
- Act on LLM suggestions
- Update based on execution logs
- Archive unused workflows

---

## 🚨 Troubleshooting

### Common Issues

**Workflow Not Starting**
- Check workflow status is ACTIVE
- Verify trigger configuration
- Check entity IDs are valid

**Node Execution Fails**
- Check node configuration
- Verify template variables exist
- Check Exotel credentials
- Review execution logs

**LLM Matching Returns Low Scores**
- Add more workflow metadata (tags, descriptions)
- Configure serviceTypes and customerTiers
- Provide detailed context in match request

**Webhook Not Received**
- Verify webhook URL is accessible
- Check Exotel webhook configuration
- Review server logs
- Test with webhook.site

---

## 📚 Examples

See `src/data/workflow-templates.ts` for complete working examples of all 5 pre-built workflows.

---

**Built with ❤️ for the Banxway Team**
