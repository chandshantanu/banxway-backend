# Integrations System Setup Guide

**Created:** 2026-01-25
**Status:** Ready for deployment
**Migration:** 006_integrations.sql

---

## What Was Implemented

### Backend

**Database Tables (Migration 006):**
- `integration_credentials` - Encrypted storage for API keys and tokens
- `user_integration_permissions` - User-level access control for integrations
- `integration_audit_logs` - Complete audit trail of all integration operations
- `organization_phone_numbers` - Phone numbers synced from Exotel

**Services:**
- `src/services/integrations/integrations.service.ts` - Integration management
- Encryption/decryption for credentials (AES-256)
- Connection testing before saving
- Phone number syncing from Exotel

**API Endpoints:**
- `GET /api/v1/settings/integrations` - List all integrations
- `GET /api/v1/settings/integrations/:type` - Get specific integration
- `POST /api/v1/settings/integrations/:type` - Configure integration
- `POST /api/v1/settings/integrations/:type/test` - Test connection
- `DELETE /api/v1/settings/integrations/:type` - Delete integration
- `GET /api/v1/settings/phone-numbers` - List phone numbers
- `POST /api/v1/settings/phone-numbers/:id/assign` - Assign to user

### Frontend

**Pages:**
- `/settings/integrations?tab=phone` - Exotel Phone configuration
- `/settings/integrations?tab=whatsapp` - Exotel WhatsApp configuration
- `/settings/team` - Phone number assignment to team members

**Components:**
- ExotelPhoneConfig - Phone integration form
- ExotelWhatsAppConfig - WhatsApp integration form with auto-reply

**Features:**
- Connection testing before saving
- Secure credential storage
- Tab-based navigation
- Integration status badges
- OAuth callback handling

---

## Supported Integrations

### 1. Exotel Phone (Click-to-Call, IVR, Recordings)

**Required Credentials:**
- Account SID
- API Key
- API Token
- Virtual Number
- Caller ID (optional)

**Capabilities:**
- Click-to-call functionality
- IVR workflows
- Call recordings
- Call tracking and analytics

**API Version:** Exotel API v3 (Voice)

### 2. Exotel WhatsApp Business API

**Required Credentials:**
- Account SID (same as Phone)
- API Key (same as Phone)
- API Token (same as Phone)
- WhatsApp Business Number
- Business Name

**Capabilities:**
- Send text messages
- Send media (images, documents)
- WhatsApp templates
- Auto-reply messages

**API Version:** Exotel API v2 (WhatsApp)

### 3. Zoho Mail (Future)

**Required Credentials:**
- Email address
- App-specific password

**Capabilities:**
- SMTP/IMAP access
- Email sending and receiving
- Attachment support

---

## Setup Instructions

### Step 1: Run Database Migration

**Option A: Migration Runner (Recommended)**

```bash
cd banxway-backend

# Get connection string from Supabase Dashboard or CREDENTIALS.md
DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@[HOST]:6543/postgres" \
node migrate-all.js
```

**Option B: Manual SQL Execution**

1. Open Supabase SQL Editor: https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/sql/new
2. Copy contents of `database/migrations/006_integrations.sql`
3. Execute the SQL
4. Verify tables were created

**Verification:**

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'integration_credentials',
  'user_integration_permissions',
  'integration_audit_logs',
  'organization_phone_numbers'
);

-- Should return 4 rows
```

### Step 2: Configure Exotel Integration

**Get Exotel Credentials:**

1. Log in to [Exotel Dashboard](https://my.exotel.com)
2. Go to **Settings** → **API Settings**
3. Copy your:
   - Account SID (e.g., `your_exotel_sid`)
   - API Key (e.g., `your_api_key`)
   - API Token (e.g., `your_api_token`)
4. Go to **Numbers** section
5. Note your Virtual Number (e.g., `01141169368`)

**Configure via Frontend:**

1. Navigate to `/settings/integrations?tab=phone`
2. Enter your Exotel credentials
3. Click "Test Connection" to verify
4. Click "Save Configuration"
5. ✅ Phone integration is now active

**Configure WhatsApp:**

1. Navigate to `/settings/integrations?tab=whatsapp`
2. Enter same Exotel credentials
3. Enter your WhatsApp Business Number
4. Optionally configure auto-reply
5. Click "Test Connection" to verify
6. Click "Save Configuration"
7. ✅ WhatsApp integration is now active

### Step 3: Assign Phone Numbers to Team

Once Exotel Phone is configured, phone numbers are automatically synced.

**Assign to team members:**

1. Navigate to `/settings/team`
2. Click "Phone Numbers" tab
3. See list of synced Exotel numbers
4. Click "Assign" on a number
5. Select team member
6. Number is now assigned for outbound calls

---

## Testing Procedures

### Test Exotel Phone Integration

**Via Frontend:**

1. Go to `/settings/integrations?tab=phone`
2. Fill in credentials
3. Click "Test Connection"
4. Should see success toast: "Exotel connection verified!"

**Via API:**

```bash
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/integrations/exotel_phone/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "account_sid": "your_sid",
    "api_key": "your_key",
    "api_token": "your_token",
    "virtual_number": "01141169368"
  }'

# Expected response:
# {"success":true,"message":"Connection test successful"}
```

### Test WhatsApp Integration

**Via Frontend:**

1. Go to `/settings/integrations?tab=whatsapp`
2. Fill in credentials
3. Click "Test Connection"
4. Should see success toast: "WhatsApp Business API verified!"

**Via API:**

```bash
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/integrations/exotel_whatsapp/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "account_sid": "your_sid",
    "api_key": "your_key",
    "api_token": "your_token",
    "whatsapp_number": "+91XXXXXXXXXX"
  }'

# Expected response:
# {"success":true,"message":"Connection test successful"}
```

### Verify Phone Number Sync

```bash
curl https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/phone-numbers \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected response:
# {
#   "success": true,
#   "data": [
#     {
#       "id": "uuid",
#       "phone_number": "01141169368",
#       "display_name": "Main Line",
#       "number_type": "virtual",
#       "is_active": true,
#       "assigned_to_user_id": null
#     }
#   ]
# }
```

---

## Database Schema

### integration_credentials

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | Organization reference |
| integration_type | VARCHAR(50) | exotel_phone, exotel_whatsapp, zoho_mail |
| credentials_encrypted | TEXT | AES-256 encrypted JSON with API keys |
| display_name | VARCHAR(255) | Human-readable name |
| is_active | BOOLEAN | Whether integration is enabled |
| is_verified | BOOLEAN | Whether credentials were tested |
| last_verified_at | TIMESTAMPTZ | Last successful verification |
| created_by | UUID | User who configured |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

**Unique Constraint:** One integration of each type per organization

### organization_phone_numbers

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | Organization reference |
| integration_id | UUID | Reference to integration_credentials |
| phone_number | VARCHAR(20) | E.164 format number |
| display_name | VARCHAR(100) | Number label |
| number_type | VARCHAR(50) | virtual, toll-free, local |
| assigned_to_user_id | UUID | Team member assigned to this number |
| is_primary | BOOLEAN | Primary outbound number |
| can_call | BOOLEAN | Voice calling enabled |
| can_sms | BOOLEAN | SMS enabled |
| is_active | BOOLEAN | Number is active |

**Unique Constraint:** One phone number per organization

---

## Security

### Credential Encryption

All API keys and tokens are encrypted using AES-256 encryption:

```typescript
// Encryption happens automatically in integrationsService.saveIntegration()
const encryptedCredentials = encryptCredentials(credentials);

// Stored as:
{
  credentials_encrypted: "base64_encoded_encrypted_json"
}

// Decryption happens only when needed:
const decrypted = decryptCredentials(integration.credentials_encrypted);
```

### Access Control

**Admin Only:**
- Configure integrations
- Delete integrations
- View credentials (decrypted)

**Managers/Agents:**
- View integration status (no credentials)
- Use integrations for sending (if granted permission)

**Row Level Security:**
- All tables have RLS enabled
- Users can only access their organization's integrations
- Audit logs are read-only

---

## Troubleshooting

### Issue: "Integration not found" after saving

**Cause:** Database migration not run

**Fix:**
```bash
cd banxway-backend
DATABASE_URL="..." node migrate-all.js
```

### Issue: "Connection test failed" for Exotel

**Possible causes:**
1. Invalid credentials (check Exotel Dashboard)
2. API endpoint not accessible (firewall/network)
3. Account suspended or inactive

**Debugging:**

```sql
-- Check integration audit logs
SELECT * FROM integration_audit_logs
WHERE integration_type = 'exotel_phone'
ORDER BY created_at DESC
LIMIT 10;
```

### Issue: Phone numbers not showing in team settings

**Cause:** Phone integration not verified or not synced

**Fix:**

1. Verify phone integration is active:
```sql
SELECT * FROM integration_credentials
WHERE integration_type = 'exotel_phone'
AND is_verified = true;
```

2. Manually trigger phone number sync:
```bash
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/integrations/exotel_phone/sync \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Issue: 401 errors when testing integration

**Cause:** Not authenticated or insufficient permissions

**Fix:**
- Ensure you're logged in as admin
- Check JWT token is valid
- Verify user has admin role in database

---

## Usage Examples

### Making a Call with Exotel

```typescript
// Using the telephony service
import { telephonyService } from '@/services/exotel/telephony.service';

const result = await telephonyService.makeCall({
  to: '+919876543210',
  from: '01141169368', // Your Exotel virtual number
  callerId: '01141169368',
  recordCall: true,
  notifyUrl: 'https://banxway-api.../api/v1/webhooks/exotel/call-status'
});

// Result:
// {
//   success: true,
//   callSid: 'exotel-call-id',
//   status: 'initiated'
// }
```

### Sending WhatsApp Message

```typescript
// Using the whatsapp service
import { whatsappService } from '@/services/exotel/whatsapp.service';

const result = await whatsappService.sendTextMessage({
  to: '+919876543210',
  from: '+91YYYYYYYYYY', // Your WhatsApp Business number
  message: 'Hello from Banxway!',
  businessId: 'your-business-id'
});

// Result:
// {
//   success: true,
//   messageId: 'exotel-msg-id',
//   status: 'queued'
// }
```

---

## Next Steps

1. **Run migration 006** to create integration tables
2. **Configure Exotel** in `/settings/integrations`
3. **Assign phone numbers** to team members in `/settings/team`
4. **Test end-to-end** by making a call or sending a WhatsApp message
5. **Monitor audit logs** for tracking usage

---

## API Quick Reference

```bash
# List integrations
GET /api/v1/settings/integrations

# Get specific integration (no credentials returned)
GET /api/v1/settings/integrations/exotel_phone

# Configure integration
POST /api/v1/settings/integrations/exotel_phone
Body: { account_sid, api_key, api_token, virtual_number, caller_id }

# Test connection (without saving)
POST /api/v1/settings/integrations/exotel_phone/test
Body: { account_sid, api_key, api_token, virtual_number }

# List phone numbers
GET /api/v1/settings/phone-numbers

# Assign phone to user
POST /api/v1/settings/phone-numbers/:id/assign
Body: { user_id: "uuid" or null }
```

---

## Exotel Configuration Reference

### Phone API (v3)

**Endpoint:** `https://api.exotel.com/v3/accounts/{sid}/calls`

**Authentication:** Basic Auth (API Key : API Token)

**Features:**
- Click-to-call
- IVR workflows
- Call recordings
- Real-time call status webhooks
- Call analytics

### WhatsApp API (v2)

**Endpoint:** `https://api.exotel.com/v2/accounts/{sid}/messages`

**Authentication:** Basic Auth (API Key : API Token)

**Features:**
- Text messages
- Media messages (images, documents)
- Template messages (pre-approved)
- Delivery status webhooks
- Message analytics

### Environment Variables (Backend)

Add these to your backend environment:

```env
# Exotel credentials (shared for Phone, WhatsApp, SMS)
EXOTEL_SID=your_account_sid
EXOTEL_API_KEY=your_api_key
EXOTEL_TOKEN=your_api_token

# Phone configuration
EXOTEL_PHONE_NUMBER=01141169368
EXOTEL_API_URL=https://api.exotel.com

# WhatsApp configuration
EXOTEL_WHATSAPP_NUMBER=+91XXXXXXXXXX

# SMS configuration
EXOTEL_SMS_NUMBER=01141169368

# Webhook base URL
EXOTEL_WEBHOOK_BASE_URL=https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io
```

**Note:** These environment variables are used as fallback. The preferred approach is to store credentials in the database via the integrations UI.

---

## Migration Details

**File:** `database/migrations/006_integrations.sql`

**Tables Created:**
1. `integration_credentials` - 4 rows (phone, whatsapp, sms, zoho)
2. `user_integration_permissions` - User-level access
3. `integration_audit_logs` - Operation tracking
4. `organization_phone_numbers` - Synced phone numbers

**Indexes Created:**
- Organization lookups
- Type lookups
- User permissions
- Audit log queries (organization + time DESC)
- Phone number assignments

**RLS Policies:**
- Organization-scoped access
- User-scoped permissions
- Read-only audit logs

---

## Success Metrics

**Integration system is successful when:**

✅ Admin can configure Exotel in UI
✅ Credentials are encrypted in database
✅ Connection test validates before saving
✅ Phone numbers sync automatically
✅ Team members can be assigned phone numbers
✅ Audit logs track all operations
✅ 401 errors handled gracefully
✅ Integration status shows in dashboard

---

## Maintenance

### Weekly Checks

- [ ] Verify all integrations are still active
- [ ] Check audit logs for failed operations
- [ ] Review credential expiration dates (if applicable)

### Monthly Tasks

- [ ] Rotate API tokens if required by policy
- [ ] Archive old audit logs (>90 days)
- [ ] Review user permissions and limits

### When Exotel Credentials Change

1. Update via `/settings/integrations` UI
2. Test connection before saving
3. Verify phone numbers still sync
4. Check audit logs for any issues

---

## Related Documentation

- **Backend Standards:** `CLAUDE.md` - API and database patterns
- **Database Setup:** `DATABASE_SETUP.md` - Migration procedures
- **Exotel Services:** `src/services/exotel/` - Implementation details
- **Frontend Standards:** `../banxway-platform/CLAUDE.md` - Component patterns

---

**Last Updated:** 2026-01-25
**Maintained By:** Development Team
