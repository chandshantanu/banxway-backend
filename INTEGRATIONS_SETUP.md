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

### 1. Exotel Phone (Click-to-Call, IVR, Call Recordings)

**Integration Type:** `exotel_phone`

**Required Credentials:**
- Account SID (e.g., `your_exotel_sid`)
- API Key (e.g., `your_api_key`)
- API Token (e.g., `your_api_token`)
- Virtual Number (e.g., `01141169368`)
- Caller ID (optional, for display)

**Capabilities:**

**Voice Calling:**
- Click-to-call from platform
- Two-way calling (connects agent to customer)
- Call duration limits (max 1 hour per call)
- Custom caller ID display
- Concurrent call handling

**IVR (Interactive Voice Response):**
- Custom IVR flow support
- DTMF input capture
- Call routing based on input
- Menu-driven conversations
- Webhook integration for dynamic flows

**Call Recordings:**
- Automatic call recording
- Single or dual channel recording
- Recording URL retrieval
- Post-call recording access
- Configurable recording retention

**Call Tracking & Analytics:**
- Real-time call status
- Call duration tracking
- Call legs (detailed call flow)
- Call completion status
- Failed call tracking
- Custom field tagging

**Bulk Operations:**
- Bulk call campaigns
- Rate-limited calling (500ms between calls)
- Custom data per contact
- Status callback URLs
- Campaign progress tracking

**API Version:** Exotel API v3 (Voice)
**Base URL:** `https://api.exotel.com/v3/accounts/{sid}/calls`
**Authentication:** Basic Auth (API Key : API Token)

---

### 2. Exotel WhatsApp Business API

**Integration Type:** `exotel_whatsapp`

**Required Credentials:**
- Account SID (same as Phone)
- API Key (same as Phone)
- API Token (same as Phone)
- WhatsApp Business Number (e.g., `+91XXXXXXXXXX`)
- Business Display Name (optional)
- Business Profile (optional)

**Capabilities:**

**Text Messaging:**
- Send plain text messages
- Character limit: 4096 characters
- Unicode support (emojis, multilingual)
- Message delivery status tracking
- Read receipts

**Rich Media Messages:**
- **Images:** JPEG, PNG (max 5MB)
- **Documents:** PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX (max 100MB)
- **Audio:** MP3, WAV, OGG, AMR (max 16MB)
- **Video:** MP4, 3GPP (max 16MB)
- **Captions:** Optional captions for media

**Location Sharing:**
- Share GPS coordinates
- Location name and address
- Interactive maps for customers

**Template Messages:**
- WhatsApp-approved message templates
- Variable placeholders ({{1}}, {{2}}, etc.)
- Multi-language support
- Header/Body/Footer sections
- Button support (Call-to-Action, Quick Reply)

**Interactive Messages:**
- List messages (up to 10 options)
- Reply buttons (up to 3 buttons)
- Product catalogs
- Order confirmations

**Auto-Reply Configuration:**
- Welcome messages
- Away messages
- Business hours messages
- Keyword-based auto-replies

**Bulk Messaging:**
- Bulk campaigns
- Rate-limited sending (300ms between messages)
- Custom data per recipient
- Status callbacks
- Campaign analytics

**Message Status Tracking:**
- Sent, Delivered, Read, Failed
- Webhook notifications for status changes
- Error code handling
- Retry logic for failed messages

**API Version:** Exotel API v2 (WhatsApp)
**Base URL:** `https://api.exotel.com/v2/accounts/{sid}/messages`
**Authentication:** Basic Auth (API Key : API Token)
**Webhook Support:** Status callbacks, incoming messages

---

### 3. Zoho Mail (Email Sending & Receiving)

**Integration Type:** `zoho_mail`

**Required Credentials:**
- Email Address (e.g., `support@yourdomain.com`)
- App-Specific Password (generated from Zoho Account Security)
- Account Name (display name, e.g., "Support Inbox")

**SMTP Configuration (Outgoing Mail):**

| Setting | Value | Description |
|---------|-------|-------------|
| **SMTP Host** | `smtp.zoho.com` | Zoho SMTP server |
| **SMTP Port** | `587` (recommended) or `465` (SSL) | TLS/STARTTLS: 587, SSL: 465 |
| **Security** | `STARTTLS` (port 587) or `SSL/TLS` (port 465) | Encryption method |
| **Authentication** | Required | Username + App Password |
| **Username** | Your full email address | Same as email address |
| **Password** | App-specific password | NOT your Zoho account password |

**SMTP Port Options:**
- **Port 587 (Recommended):** STARTTLS encryption, widely supported
- **Port 465:** SSL/TLS encryption, legacy but reliable
- **Port 25:** Not recommended (often blocked by ISPs)

**IMAP Configuration (Incoming Mail):**

| Setting | Value | Description |
|---------|-------|-------------|
| **IMAP Host** | `imap.zoho.com` | Zoho IMAP server |
| **IMAP Port** | `993` | SSL/TLS encrypted connection |
| **Security** | `SSL/TLS` | Mandatory encryption |
| **Authentication** | Required | Username + App Password |
| **Username** | Your full email address | Same as email address |
| **Password** | App-specific password | NOT your Zoho account password |

**IMAP Folders:**
- INBOX - Main inbox
- Sent - Sent messages
- Drafts - Draft messages
- Trash - Deleted messages
- Spam - Spam messages
- Custom folders supported

**Capabilities:**

**Email Sending (SMTP):**
- Send HTML and plain text emails
- Attachment support (up to 20MB per email)
- Custom email signatures (HTML/text)
- Reply-To headers
- CC and BCC support
- Custom headers
- Email threading (In-Reply-To, References)
- Priority headers (High, Normal, Low)

**Email Receiving (IMAP):**
- Real-time email polling (configurable interval: 30-300 seconds)
- Folder monitoring (INBOX, custom folders)
- Attachment downloading
- Email threading detection
- Read/unread status tracking
- Email parsing (HTML to text)
- Spam filtering
- Email size limits (max 50MB per email)

**Advanced Features:**
- **Auto-Threading:** Automatically link related emails
- **Email Templates:** Reusable email templates
- **Signatures:** Custom HTML/text signatures per account
- **Auto-Assignment:** Assign emails to specific users
- **Tagging:** Auto-tag emails based on rules
- **Forwarding:** Forward emails to other addresses
- **Vacation Responder:** Out-of-office auto-replies

**Polling Configuration:**
- **Default Interval:** 30 seconds
- **Adjustable Range:** 10 seconds to 5 minutes
- **Idle Timeout:** 29 minutes (IMAP IDLE support)
- **Connection Pooling:** Reuse connections for efficiency
- **Error Handling:** Automatic reconnection on failure

**Security Features:**
- **Encryption:** AES-256 for stored passwords
- **TLS/SSL:** All connections encrypted
- **OAuth 2.0:** Future support (currently app passwords)
- **Two-Factor Authentication:** Required for app password generation

**Limitations:**
- **SMTP Rate Limit:** 500 emails per day (Zoho Mail free), 1000+ (paid plans)
- **IMAP Connections:** Max 5 simultaneous connections per account
- **Attachment Size:** 20MB per attachment (SMTP), 50MB total (IMAP)
- **Storage:** Depends on Zoho Mail plan

**API Version:** Standard SMTP/IMAP protocols
**Protocol Support:** SMTP (RFC 5321), IMAP4rev1 (RFC 3501)
**Authentication:** App-Specific Passwords (Zoho Security Settings)

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

### Step 2: Configure Exotel Phone Integration

**Get Exotel Credentials:**

1. **Log in to Exotel Dashboard:**
   - Visit [https://my.exotel.com](https://my.exotel.com)
   - Use your Exotel account credentials

2. **Navigate to API Settings:**
   - Click **Settings** (gear icon) in top right
   - Select **API Settings** from left sidebar

3. **Copy API Credentials:**
   - **Account SID:** Copy your unique account identifier (e.g., `chatslytics1`)
   - **API Key:** Copy your API key (e.g., `ac...`)
   - **API Token:** Copy your API secret token (e.g., `a1b2c3...`)
   - ⚠️ **IMPORTANT:** Store these securely - they provide full account access

4. **Get Virtual Phone Number:**
   - Navigate to **Numbers** section
   - Note your Exotel Virtual Number (e.g., `01141169368`)
   - This is the number that will appear as caller ID
   - Verify number is active and not suspended

5. **Verify Account Status:**
   - Ensure account is active (not suspended)
   - Check account balance if prepaid
   - Verify voice calling is enabled

**Configure via Backend API:**

```bash
# Test connection first (without saving)
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/integrations/exotel_phone/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "account_sid": "your_exotel_sid",
    "api_key": "your_api_key",
    "api_token": "your_api_token",
    "virtual_number": "01141169368"
  }'

# If successful, save configuration
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/integrations/exotel_phone \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "account_sid": "your_exotel_sid",
    "api_key": "your_api_key",
    "api_token": "your_api_token",
    "virtual_number": "01141169368",
    "caller_id": "01141169368",
    "display_name": "Main Phone Line"
  }'
```

**Configure via Frontend:**

1. Navigate to `/settings/integrations?tab=phone`
2. Fill in the form:
   - **Account SID:** Your Exotel account SID
   - **API Key:** Your Exotel API key
   - **API Token:** Your Exotel API token
   - **Virtual Number:** Your Exotel phone number (10 digits, no +91)
   - **Caller ID:** (Optional) Display number for outgoing calls
   - **Display Name:** Friendly name (e.g., "Main Line")
3. Click **"Test Connection"** button
   - System will verify credentials with Exotel API
   - Should show green success message
4. Click **"Save Configuration"**
5. ✅ Phone integration is now active

**Verification:**
- Integration appears in `/settings/integrations` with green "Active" badge
- Phone numbers appear in `/settings/phone-numbers`
- Click-to-call buttons work in communication threads

---

### Step 3: Configure Exotel WhatsApp Integration

**Prerequisites:**
- Exotel account with WhatsApp Business API enabled
- WhatsApp Business Number verified with Facebook
- Same Exotel credentials as Phone integration

**Get WhatsApp Business Number:**

1. **In Exotel Dashboard:**
   - Navigate to **WhatsApp** section
   - Verify your WhatsApp Business Number is active
   - Note the number in E.164 format (e.g., `+91XXXXXXXXXX`)
   - Check daily message limits

2. **Facebook Business Manager:**
   - Verify business profile is approved
   - Check WhatsApp Business account status
   - Note any template message approvals

**Configure via Backend API:**

```bash
# Test WhatsApp connection
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/integrations/exotel_whatsapp/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "account_sid": "your_exotel_sid",
    "api_key": "your_api_key",
    "api_token": "your_api_token",
    "whatsapp_number": "+91XXXXXXXXXX",
    "business_name": "Your Company Name"
  }'

# Save WhatsApp configuration
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/integrations/exotel_whatsapp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "account_sid": "your_exotel_sid",
    "api_key": "your_api_key",
    "api_token": "your_api_token",
    "whatsapp_number": "+91XXXXXXXXXX",
    "business_name": "Your Company Name",
    "auto_reply_enabled": true,
    "auto_reply_message": "Thanks for contacting us! We'\''ll respond shortly.",
    "business_hours": {
      "enabled": true,
      "timezone": "Asia/Kolkata",
      "monday": {"start": "09:00", "end": "18:00"},
      "tuesday": {"start": "09:00", "end": "18:00"},
      "wednesday": {"start": "09:00", "end": "18:00"},
      "thursday": {"start": "09:00", "end": "18:00"},
      "friday": {"start": "09:00", "end": "18:00"},
      "saturday": {"start": "10:00", "end": "14:00"},
      "sunday": {"closed": true}
    }
  }'
```

**Configure via Frontend:**

1. Navigate to `/settings/integrations?tab=whatsapp`
2. Fill in the form:
   - **Account SID:** Same as Phone integration
   - **API Key:** Same as Phone integration
   - **API Token:** Same as Phone integration
   - **WhatsApp Business Number:** With country code (e.g., `+91XXXXXXXXXX`)
   - **Business Display Name:** Your registered business name
3. **Auto-Reply Settings (Optional):**
   - **Enable Auto-Reply:** Toggle on
   - **Welcome Message:** Custom greeting for new contacts
   - **Away Message:** Message when offline
   - **Business Hours:** Configure hours of operation
4. Click **"Test Connection"** to verify
5. Click **"Save Configuration"**
6. ✅ WhatsApp integration is now active

**Template Message Setup:**

1. **Create Templates in Facebook Business Manager:**
   - Go to WhatsApp Manager
   - Create message templates
   - Wait for Facebook approval (24-48 hours)

2. **Sync Templates to Banxway:**
   ```bash
   curl -X POST \
     https://banxway-api.../api/v1/settings/integrations/exotel_whatsapp/sync-templates \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

3. **View Templates in UI:**
   - Navigate to `/settings/integrations?tab=whatsapp`
   - Scroll to "WhatsApp Templates" section
   - See list of approved templates
   - Use in compose or workflows

---

### Step 4: Configure Zoho Mail Integration

**Prerequisites:**
- Active Zoho Mail account (free or paid)
- Email domain configured in Zoho
- Two-Factor Authentication enabled

**Generate App-Specific Password:**

1. **Enable Two-Factor Authentication (if not already):**
   - Visit [https://accounts.zoho.com/home](https://accounts.zoho.com/home)
   - Click **Security** in left sidebar
   - Enable **Two-Factor Authentication**
   - Complete setup with authenticator app or SMS

2. **Generate App Password:**
   - Still in Security settings
   - Scroll to **App Passwords** section
   - Click **Generate New Password**
   - Enter name: `Banxway Platform`
   - Select **SMTP** and **IMAP** access
   - Click **Generate**
   - ⚠️ **CRITICAL:** Copy the password immediately (won't be shown again)
   - Example: `abcd1234efgh5678`

3. **Verify SMTP/IMAP is Enabled:**
   - Go to Zoho Mail Settings
   - Navigate to **Email Forwarding and POP/IMAP**
   - Ensure **IMAP Access** is enabled
   - Note: SMTP is always enabled for Zoho accounts

**Configure via Backend API:**

```bash
# Test Zoho email account
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/email-accounts/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "email": "support@yourdomain.com",
    "smtp_host": "smtp.zoho.com",
    "smtp_port": 587,
    "smtp_user": "support@yourdomain.com",
    "smtp_password": "your_app_password",
    "imap_host": "imap.zoho.com",
    "imap_port": 993,
    "imap_user": "support@yourdomain.com",
    "imap_password": "your_app_password"
  }'

# Save email account
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/email-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Support Inbox",
    "email": "support@yourdomain.com",
    "smtp_host": "smtp.zoho.com",
    "smtp_port": 587,
    "smtp_user": "support@yourdomain.com",
    "smtp_password": "your_app_password",
    "smtp_secure": false,
    "smtp_enabled": true,
    "imap_host": "imap.zoho.com",
    "imap_port": 993,
    "imap_user": "support@yourdomain.com",
    "imap_password": "your_app_password",
    "imap_tls": true,
    "imap_enabled": true,
    "poll_interval_ms": 30000,
    "is_default": true,
    "signature_html": "<p>Best regards,<br>Support Team</p>",
    "signature_text": "Best regards,\\nSupport Team"
  }'
```

**Configure via Frontend:**

1. Navigate to `/settings/email-accounts`
2. Click **"Add Email Account"** button
3. Select **"Zoho Mail"** from provider dropdown
4. Fill in the form:
   - **Account Name:** Friendly name (e.g., "Support Inbox")
   - **Email Address:** Your full email address
   - **App Password:** Paste the app-specific password you generated
   - **Email Signature:** (Optional) Your email signature
   - **Set as Default:** Toggle on if this is your primary sending account
5. **SMTP Settings** (Auto-filled for Zoho):
   - Host: `smtp.zoho.com`
   - Port: `587`
   - Username: Same as email address
6. **IMAP Settings** (Auto-filled for Zoho):
   - Host: `imap.zoho.com`
   - Port: `993`
   - Username: Same as email address
7. Click **"Test Connection"** - should test both SMTP and IMAP
8. Click **"Add Account"**
9. ✅ Email account is now configured

**Configure Polling Settings:**

```bash
# Update polling interval
curl -X PATCH \
  https://banxway-api.../api/v1/settings/email-accounts/{account_id} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "poll_interval_ms": 60000,
    "imap_enabled": true
  }'
```

**Polling Intervals:**
- **30 seconds:** Real-time monitoring (high API usage)
- **60 seconds:** Recommended for most use cases
- **120 seconds:** Lower priority inboxes
- **300 seconds:** Archive/backup accounts

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

### Test 1: Exotel Phone Integration - Connection Test

**Purpose:** Verify Exotel API credentials and account access

**Via Frontend:**

1. Navigate to `/settings/integrations?tab=phone`
2. Fill in credentials:
   - Account SID
   - API Key
   - API Token
   - Virtual Number
3. Click **"Test Connection"** button
4. ✅ **Expected:** Green success toast "Exotel connection verified!"
5. ❌ **On Failure:** Red error toast with specific error message

**Via API:**

```bash
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/integrations/exotel_phone/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "account_sid": "your_exotel_sid",
    "api_key": "your_api_key",
    "api_token": "your_api_token",
    "virtual_number": "01141169368"
  }'

# ✅ Expected Success Response:
# {
#   "success": true,
#   "message": "Connection test successful",
#   "data": {
#     "account_verified": true,
#     "voice_enabled": true,
#     "virtual_number_active": true
#   }
# }

# ❌ Expected Failure Response:
# {
#   "success": false,
#   "error": "Invalid credentials",
#   "details": {
#     "status_code": 401,
#     "exotel_error": "Authentication failed"
#   }
# }
```

**Common Errors:**
- **401 Unauthorized:** Invalid API Key or Token
- **403 Forbidden:** Account suspended or voice not enabled
- **404 Not Found:** Invalid Account SID
- **Network timeout:** Check internet connection or Exotel API status

---

### Test 2: Exotel Phone - Make Test Call

**Purpose:** Verify end-to-end call functionality

**Via Platform UI:**

1. Create or open a communication thread
2. Click **"Call Customer"** button
3. Enter your test phone number (where you can receive calls)
4. Click **"Initiate Call"**
5. ✅ **Expected:**
   - You receive a call on your phone
   - After answering, customer's number is dialed
   - Both parties connected
   - Call appears in thread history

**Via API:**

```bash
curl -X POST \
  https://banxway-api.../api/v1/communications/threads/{thread_id}/call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "from": "+919876543210",
    "to": "+919123456789",
    "record": true
  }'

# ✅ Expected Response:
# {
#   "success": true,
#   "data": {
#     "call_sid": "exotel_call_123456",
#     "status": "queued",
#     "from": "+919876543210",
#     "to": "+919123456789",
#     "duration": null,
#     "recording_url": null
#   }
# }
```

**Verification Steps:**
1. Check call status in thread timeline
2. Wait for call to complete
3. Verify call recording URL appears (if enabled)
4. Check call duration is accurate
5. Verify webhook updates call status to "completed"

---

### Test 3: WhatsApp Integration - Connection Test

**Purpose:** Verify WhatsApp Business API credentials and access

**Via Frontend:**

1. Navigate to `/settings/integrations?tab=whatsapp`
2. Fill in credentials:
   - Account SID (same as Phone)
   - API Key (same as Phone)
   - API Token (same as Phone)
   - WhatsApp Business Number
3. Click **"Test Connection"** button
4. ✅ **Expected:** Green success toast "WhatsApp Business API verified!"
5. ❌ **On Failure:** Specific error message about what failed

**Via API:**

```bash
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/integrations/exotel_whatsapp/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "account_sid": "your_exotel_sid",
    "api_key": "your_api_key",
    "api_token": "your_api_token",
    "whatsapp_number": "+91XXXXXXXXXX"
  }'

# ✅ Expected Success Response:
# {
#   "success": true,
#   "message": "WhatsApp connection verified",
#   "data": {
#     "account_verified": true,
#     "whatsapp_enabled": true,
#     "business_number_active": true,
#     "quality_rating": "GREEN",
#     "messaging_limit": "TIER_3"
#   }
# }

# ❌ Expected Failure Response:
# {
#   "success": false,
#   "error": "WhatsApp number not verified",
#   "details": {
#     "status_code": 422,
#     "exotel_error": "WhatsApp number not found in account"
#   }
# }
```

**Common Errors:**
- **Unverified Number:** WhatsApp Business number not registered with Facebook
- **Quality Rating: RED:** Message quality too low, sending restricted
- **Messaging Limit Reached:** Daily/monthly limit exceeded
- **Template Required:** Trying to send without approved template

---

### Test 4: WhatsApp - Send Test Message

**Purpose:** Verify message sending functionality

**Test Text Message:**

```bash
curl -X POST \
  https://banxway-api.../api/v1/communications/threads/{thread_id}/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "channel": "WHATSAPP",
    "content": "Hello! This is a test message from Banxway.",
    "to": "+919876543210"
  }'

# ✅ Expected Response:
# {
#   "success": true,
#   "data": {
#     "message_id": "uuid",
#     "message_sid": "exotel_msg_789",
#     "status": "queued",
#     "channel": "WHATSAPP",
#     "to": "+919876543210",
#     "created_at": "2026-01-25T12:00:00Z"
#   }
# }
```

**Test Image Message:**

```bash
curl -X POST \
  https://banxway-api.../api/v1/communications/messages/send-media \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "thread_id": "uuid",
    "channel": "WHATSAPP",
    "media_type": "image",
    "media_url": "https://example.com/image.jpg",
    "caption": "Test image",
    "to": "+919876543210"
  }'
```

**Test Template Message:**

```bash
curl -X POST \
  https://banxway-api.../api/v1/communications/messages/send-template \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "thread_id": "uuid",
    "template_name": "shipping_update",
    "language": "en",
    "to": "+919876543210",
    "variables": {
      "1": "BX-2024-1234",
      "2": "Mumbai Port",
      "3": "25-Jan-2026"
    }
  }'
```

**Verification:**
1. Check message appears in thread timeline
2. Wait for delivery status update (webhook)
3. Verify message delivered on WhatsApp
4. Check read receipt (if customer reads)
5. Verify message stored in database correctly

---

### Test 5: Zoho Mail - SMTP Connection Test

**Purpose:** Verify outgoing email sending

**Via Frontend:**

1. Navigate to `/settings/email-accounts`
2. Click **"Add Email Account"**
3. Select provider: **Zoho Mail**
4. Fill in credentials and app password
5. Click **"Test Connection"**
6. ✅ **Expected:** "SMTP: ✓ Connected, IMAP: ✓ Connected"

**Via API:**

```bash
curl -X POST \
  https://banxway-api.../api/v1/settings/email-accounts/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "email": "support@yourdomain.com",
    "smtp_host": "smtp.zoho.com",
    "smtp_port": 587,
    "smtp_user": "support@yourdomain.com",
    "smtp_password": "your_app_password",
    "imap_host": "imap.zoho.com",
    "imap_port": 993,
    "imap_user": "support@yourdomain.com",
    "imap_password": "your_app_password"
  }'

# ✅ Expected Success Response:
# {
#   "success": true,
#   "data": {
#     "smtp": {
#       "success": true,
#       "host": "smtp.zoho.com",
#       "port": 587,
#       "secure": false
#     },
#     "imap": {
#       "success": true,
#       "host": "imap.zoho.com",
#       "port": 993,
#       "secure": true,
#       "mailbox_count": 5,
#       "unread_count": 12
#     }
#   }
# }

# ❌ Expected Failure Response:
# {
#   "success": false,
#   "data": {
#     "smtp": {
#       "success": false,
#       "error": "Invalid login: 535 Authentication failed"
#     },
#     "imap": {
#       "success": true,
#       "host": "imap.zoho.com"
#     }
#   }
# }
```

**Common SMTP Errors:**
- **535 Authentication Failed:** Wrong app password or username
- **Connection Timeout:** Check SMTP host/port or firewall
- **TLS Error:** Port mismatch (use 587 for STARTTLS, 465 for SSL)
- **Rate Limit:** Too many test connections (wait 1 minute)

---

### Test 6: Zoho Mail - Send Test Email

**Purpose:** Verify end-to-end email sending

**Send via Platform:**

```bash
curl -X POST \
  https://banxway-api.../api/v1/communications/threads/{thread_id}/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "channel": "EMAIL",
    "to": "test@example.com",
    "subject": "Test Email from Banxway",
    "content_html": "<p>This is a <strong>test email</strong> from Banxway platform.</p>",
    "content_text": "This is a test email from Banxway platform."
  }'

# ✅ Expected Response:
# {
#   "success": true,
#   "data": {
#     "message_id": "uuid",
#     "smtp_message_id": "<abc123@yourdomain.com>",
#     "status": "sent",
#     "to": "test@example.com",
#     "subject": "Test Email from Banxway",
#     "created_at": "2026-01-25T12:00:00Z"
#   }
# }
```

**Verification:**
1. Check email appears in thread timeline
2. Check recipient's inbox (test email address)
3. Verify email formatting (HTML rendered correctly)
4. Check email headers (From, Reply-To correct)
5. Verify signature appended correctly

---

### Test 7: Zoho Mail - IMAP Polling Test

**Purpose:** Verify incoming email receiving

**Manual Test:**

1. Send an email TO your configured Zoho account
2. Wait for polling interval (default: 30 seconds)
3. Check `/inbox` in Banxway platform
4. ✅ **Expected:** Email appears as new thread or message

**Force Immediate Poll:**

```bash
curl -X POST \
  https://banxway-api.../api/v1/settings/email-accounts/{account_id}/poll-now \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# ✅ Expected Response:
# {
#   "success": true,
#   "data": {
#     "new_messages": 3,
#     "new_threads": 2,
#     "poll_duration_ms": 1234,
#     "last_polled_at": "2026-01-25T12:00:00Z"
#   }
# }
```

**Verification:**
1. Check message appears in correct thread
2. Verify email parsed correctly (subject, body, attachments)
3. Check customer auto-linked by email address
4. Verify attachments downloaded and accessible
5. Check thread auto-assigned to correct user (if configured)

---

### Test 8: Phone Number Sync Verification

**Purpose:** Verify Exotel phone numbers synced to database

```bash
curl https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/phone-numbers \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# ✅ Expected Response:
# {
#   "success": true,
#   "data": [
#     {
#       "id": "uuid",
#       "phone_number": "01141169368",
#       "display_name": "Main Line",
#       "number_type": "virtual",
#       "can_call": true,
#       "can_sms": true,
#       "is_active": true,
#       "is_primary": true,
#       "assigned_to_user_id": null,
#       "created_at": "2026-01-25T10:00:00Z"
#     }
#   ],
#   "count": 1
# }
```

**Verification:**
- All Exotel numbers appear
- Capabilities correct (can_call, can_sms)
- One number marked as primary
- Numbers can be assigned to users

---

### Test 9: Integration Status Dashboard

**Purpose:** Verify all integrations shown correctly

```bash
curl https://banxway-api.../api/v1/settings/configuration-status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# ✅ Expected Response:
# {
#   "success": true,
#   "data": {
#     "email": {
#       "configured": true,
#       "accounts": 2,
#       "default_account": "support@yourdomain.com"
#     },
#     "phone": {
#       "configured": true,
#       "provider": "exotel",
#       "numbers": 1
#     },
#     "whatsapp": {
#       "configured": true,
#       "provider": "exotel",
#       "number": "+91XXXXXXXXXX"
#     },
#     "sms": {
#       "configured": false
#     }
#   }
# }
```

**Via Frontend:**

1. Navigate to `/settings`
2. Check integration status cards:
   - ✅ **Email:** Green badge "2 accounts configured"
   - ✅ **Phone:** Green badge "Exotel connected"
   - ✅ **WhatsApp:** Green badge "Active"
3. Click each card to see detailed configuration

---

### Test 10: End-to-End Workflow Test

**Purpose:** Verify complete integration workflow

**Scenario: Customer Email → Platform → WhatsApp Reply**

1. **Customer sends email** to `support@yourdomain.com`
2. **IMAP polling** detects new email (within 30 seconds)
3. **Platform creates:**
   - New thread in database
   - Customer record (if doesn't exist)
   - Message record with parsed email content
4. **WebSocket notification** sent to online agents
5. **Agent views** email in `/inbox`
6. **Agent replies** via WhatsApp from platform
7. **WhatsApp message** sent via Exotel API
8. **Delivery confirmation** webhook received
9. **Thread updated** with delivery status
10. **Customer receives** WhatsApp message

**Verification Checklist:**
- [ ] Email received and parsed correctly
- [ ] Thread created with correct customer
- [ ] WebSocket notification sent
- [ ] Agent sees email in inbox
- [ ] WhatsApp reply sent successfully
- [ ] Delivery status updated
- [ ] Both messages visible in thread timeline
- [ ] No duplicate threads created

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

### Issue 1: "Integration not found" after saving

**Symptoms:**
- Integration shows in UI but API returns 404
- Cannot retrieve integration after creation
- Settings page shows empty state

**Root Cause:** Database migration 006 not applied

**Solution:**

```bash
cd banxway-backend

# Check if migration 006 exists in schema_migrations
DATABASE_URL="your-connection-string" psql -c "SELECT * FROM schema_migrations WHERE migration_name = '006_integrations.sql';"

# If not found, run migrations
DATABASE_URL="your-connection-string" node migrate-all.js
```

**Verification:**
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('integration_credentials', 'organization_phone_numbers');
```

---

### Issue 2: "Connection test failed" for Exotel Phone

**Symptoms:**
- Test connection returns 401/403
- "Invalid credentials" error
- Cannot make test calls

**Possible Causes & Fixes:**

**1. Invalid API Credentials**
```
Error: 401 Unauthorized
```
- **Check:** Verify Account SID, API Key, API Token in Exotel Dashboard
- **Fix:** Copy credentials again from Settings → API Settings
- **Verify:** No extra spaces or newlines when pasting

**2. Account Suspended**
```
Error: 403 Forbidden - Account inactive
```
- **Check:** Exotel Dashboard for account status
- **Fix:** Contact Exotel support or recharge account (if prepaid)

**3. Voice Service Not Enabled**
```
Error: 403 Forbidden - Voice not enabled
```
- **Check:** Services tab in Exotel Dashboard
- **Fix:** Enable voice calling service in account settings

**4. Network/Firewall Issues**
```
Error: Network timeout
```
- **Check:** Can you access https://api.exotel.com from server?
- **Fix:** Whitelist Exotel API IPs in firewall
- **Test:** `curl https://api.exotel.com/v3/accounts/{sid}/calls -u {key}:{token}`

**5. Invalid Virtual Number**
```
Error: 422 - Virtual number not found
```
- **Check:** Number exists in Exotel Dashboard → Numbers
- **Fix:** Use exact format from dashboard (10 digits, no +91)

**Debugging:**

```sql
-- Check audit logs for detailed errors
SELECT
  action,
  status,
  details,
  created_at
FROM integration_audit_logs
WHERE integration_type = 'exotel_phone'
ORDER BY created_at DESC
LIMIT 10;
```

```bash
# Test Exotel API directly
curl -X GET \
  "https://api.exotel.com/v3/accounts/{your_sid}/calls?limit=1" \
  -u "{api_key}:{api_token}"

# Should return recent calls list (not error)
```

---

### Issue 3: "Connection test failed" for WhatsApp

**Symptoms:**
- WhatsApp test fails even when Phone works
- "WhatsApp number not verified" error
- Template messages not sending

**Possible Causes & Fixes:**

**1. WhatsApp Service Not Enabled**
```
Error: WhatsApp not enabled on account
```
- **Check:** Exotel Dashboard → WhatsApp section
- **Fix:** Enable WhatsApp Business API service
- **Note:** May require separate activation and Facebook Business account

**2. Number Not Verified with Facebook**
```
Error: WhatsApp number not registered
```
- **Check:** Facebook Business Manager → WhatsApp
- **Fix:** Complete WhatsApp Business verification process
- **Timeline:** 24-48 hours for Facebook approval

**3. Invalid Number Format**
```
Error: Invalid WhatsApp number format
```
- **Check:** Must use E.164 format (e.g., `+91XXXXXXXXXX`)
- **Fix:** Include country code with + prefix

**4. Quality Rating Issues**
```
Error: Message quality rating too low
```
- **Check:** WhatsApp Manager → Quality Rating
- **Fix:** Improve message quality, avoid spam patterns
- **Note:** RED rating blocks all messages

**5. Messaging Limit Exceeded**
```
Error: Daily messaging limit reached
```
- **Check:** WhatsApp Manager → Messaging Limits
- **Fix:** Wait for daily reset or upgrade tier
- **Tiers:** Tier 1 (1K/day) → Tier 4 (Unlimited)

---

### Issue 4: Zoho Mail SMTP Authentication Failure

**Symptoms:**
- SMTP test fails with "535 Authentication failed"
- Can login to Zoho webmail but SMTP fails
- Email sending fails silently

**Possible Causes & Fixes:**

**1. Using Regular Password Instead of App Password**
```
Error: 535 5.7.8 Authentication failed
```
- **Check:** Are you using your Zoho account password?
- **Fix:** Generate App-Specific Password:
  1. Visit https://accounts.zoho.com/home
  2. Security → App Passwords
  3. Generate new password
  4. Use this password (NOT account password)

**2. Two-Factor Authentication Not Enabled**
```
Error: App password generation unavailable
```
- **Fix:** Enable 2FA first:
  1. Zoho Account Settings → Security
  2. Enable Two-Factor Authentication
  3. Complete setup
  4. Then generate app password

**3. Wrong SMTP Port or Encryption**
```
Error: Connection timeout / SSL error
```
- **Check:** Port 587 with STARTTLS (NOT SSL)
- **Fix:** Use these exact settings:
  - Port 587 + STARTTLS (secure: false)
  - OR Port 465 + SSL/TLS (secure: true)
  - NOT Port 25

**4. App Password Expired or Revoked**
```
Error: Authentication failed (worked before)
```
- **Fix:** Generate new app password
- **Update:** Save new password in Banxway settings

**5. Zoho Server Issues**
```
Error: smtp.zoho.com connection refused
```
- **Check:** https://status.zoho.com for outages
- **Test:** `telnet smtp.zoho.com 587`
- **Wait:** Retry after server maintenance

---

### Issue 5: IMAP Polling Not Working

**Symptoms:**
- New emails not appearing in platform
- Last poll time not updating
- Manual poll works but automatic doesn't

**Possible Causes & Fixes:**

**1. IMAP Not Enabled in UI**
```
Status: last_polled_at: null
```
- **Check:** Email account settings → IMAP Enabled
- **Fix:** Toggle "Enable IMAP Polling" to ON
- **Verify:** `imap_enabled = true` in database

**2. Email Poller Worker Not Running**
```
Status: No new emails for >1 hour
```
- **Check:** Backend logs for poller worker
```bash
# Check if worker is running
ps aux | grep email-poller

# Check logs
tail -f logs/email-poller.log
```
- **Fix:** Restart email poller worker
```bash
npm run worker:email-poller
```

**3. IMAP Connection Timeout**
```
Error: IMAP timeout after 30 seconds
```
- **Check:** Firewall blocking port 993
- **Fix:** Allow outbound HTTPS/993
- **Test:** `telnet imap.zoho.com 993`

**4. Too Many IMAP Connections**
```
Error: Maximum connections exceeded
```
- **Cause:** Multiple workers polling same account
- **Fix:** Ensure only one poller per account
- **Limit:** Zoho allows max 5 simultaneous IMAP connections

**5. Polling Interval Too Aggressive**
```
Error: Rate limited by Zoho
```
- **Check:** Poll interval < 10 seconds
- **Fix:** Increase to at least 30 seconds
```bash
curl -X PATCH .../email-accounts/{id} \
  -d '{"poll_interval_ms": 30000}'
```

---

### Issue 6: Phone numbers not showing in team settings

**Symptoms:**
- `/settings/phone-numbers` returns empty array
- Exotel integration active but no numbers
- Cannot assign numbers to team

**Root Cause:** Phone numbers not synced from Exotel

**Solution:**

**1. Verify Integration Active:**
```sql
SELECT
  id,
  integration_type,
  is_active,
  is_verified,
  last_verified_at
FROM integration_credentials
WHERE integration_type = 'exotel_phone';
```

**2. Manually Trigger Sync:**
```bash
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/integrations/exotel_phone/sync \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected response:
# {
#   "success": true,
#   "data": {
#     "synced_numbers": 1,
#     "new_numbers": 1,
#     "updated_numbers": 0
#   }
# }
```

**3. Check Phone Numbers Table:**
```sql
SELECT
  phone_number,
  display_name,
  number_type,
  is_active
FROM organization_phone_numbers
WHERE is_active = true;
```

**4. Verify Exotel API Returns Numbers:**
```bash
curl -X GET \
  "https://api.exotel.com/v3/accounts/{sid}/numbers" \
  -u "{api_key}:{api_token}"
```

---

### Issue 7: 401 Unauthorized when testing integrations

**Symptoms:**
- Logged in but getting 401 errors
- Test connection fails with "Unauthorized"
- Other API calls work fine

**Possible Causes & Fixes:**

**1. JWT Token Expired**
```
Error: Session expired
```
- **Check:** Token age (default expiry: 24 hours)
- **Fix:** Logout and login again
- **Automatic:** Frontend should refresh token

**2. Insufficient Permissions**
```
Error: User does not have admin role
```
- **Check:** User role in database
```sql
SELECT id, email, role FROM users WHERE id = 'your-user-id';
```
- **Fix:** Update role to admin
```sql
UPDATE users SET role = 'admin' WHERE id = 'your-user-id';
```

**3. Wrong Authorization Header**
```
Error: Authorization header missing
```
- **Check:** Header format: `Authorization: Bearer {token}`
- **Fix:** Ensure "Bearer " prefix included

**4. Token from Different Environment**
```
Error: Invalid token signature
```
- **Check:** Using production token on dev server?
- **Fix:** Login to correct environment

---

### Issue 8: Webhooks Not Being Received

**Symptoms:**
- Call status not updating
- WhatsApp delivery status stuck at "sent"
- Webhooks configured but no callbacks

**Possible Causes & Fixes:**

**1. Webhook URL Not Publicly Accessible**
```
Exotel Error: Webhook URL timeout
```
- **Check:** Is your backend URL public?
- **Test:** `curl https://your-backend/api/v1/webhooks/exotel/call-status`
- **Fix:** Use ngrok for local testing
```bash
ngrok http 8000
# Use ngrok URL in Exotel webhook config
```

**2. Webhook URL Not Configured in Exotel**
```
No callbacks received
```
- **Check:** Exotel Dashboard → Webhook Settings
- **Fix:** Add webhook URL:
  - Call Status: `https://your-api/api/v1/webhooks/exotel/call-status`
  - WhatsApp Status: `https://your-api/api/v1/webhooks/exotel/whatsapp-status`

**3. Webhook Signature Verification Failing**
```
Error: Invalid webhook signature
```
- **Check:** Webhook signature validation logic
- **Fix:** Temporarily disable signature check for testing
- **Production:** Always verify signatures

**4. Webhook Endpoint Returning Errors**
```
Exotel retries exhausted
```
- **Check:** Backend logs for webhook errors
- **Fix:** Ensure webhook endpoint returns 200 OK
- **Debug:** Log webhook payload for inspection

---

### Issue 9: Encryption/Decryption Errors

**Symptoms:**
- "Failed to decrypt password" errors
- Can't retrieve saved credentials
- Integration saved but can't use it

**Possible Causes & Fixes:**

**1. Encryption Key Changed**
```
Error: decrypt_email_password failed
```
- **Cause:** `ENCRYPTION_MASTER_KEY` env var changed
- **Fix:** Restore original encryption key
- **Warning:** Changing key makes old data unreadable

**2. PostgreSQL pgcrypto Not Installed**
```
Error: Function encrypt/decrypt does not exist
```
- **Fix:** Run migration 004 or manually install:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**3. Encrypted Data Corrupted**
```
Error: Invalid encrypted data format
```
- **Check:** Database column has valid data
- **Fix:** Re-save integration with correct credentials

---

### Issue 10: Integration Active But Not Working

**Symptoms:**
- Status shows "Active" and "Verified"
- Test connection passes
- Actual usage fails (calls, messages)

**Debugging Steps:**

**1. Check Audit Logs:**
```sql
SELECT
  action,
  status,
  details->'error' as error,
  created_at
FROM integration_audit_logs
WHERE integration_type = 'exotel_phone'
AND status = 'failed'
ORDER BY created_at DESC
LIMIT 20;
```

**2. Test API Directly:**
```bash
# Test call
curl -X POST \
  "https://api.exotel.com/v3/accounts/{sid}/calls" \
  -u "{key}:{token}" \
  -d '{
    "from": {"contact_uri": "+919876543210"},
    "to": {"contact_uri": "+919123456789"},
    "virtual_number": "01141169368"
  }'

# Check response for errors
```

**3. Check Backend Logs:**
```bash
# Filter for integration errors
tail -f logs/app.log | grep -i "exotel\|integration"
```

**4. Verify Environment Variables:**
```bash
# Check if credentials set
echo $EXOTEL_SID
echo $EXOTEL_API_KEY
echo $EXOTEL_TOKEN

# Verify match database
```

**5. Test End-to-End:**
- Create test thread
- Try making call/sending message
- Check thread timeline for error details
- Check webhook logs

---

### Getting Help

**If issue persists after troubleshooting:**

1. **Collect Debug Information:**
```bash
# Backend logs
tail -n 100 logs/app.log > debug-logs.txt

# Integration status
curl .../api/v1/settings/configuration-status > status.json

# Audit logs
psql -c "SELECT * FROM integration_audit_logs ORDER BY created_at DESC LIMIT 50;" > audit.csv
```

2. **Check Status Pages:**
- Exotel: https://status.exotel.com
- Zoho: https://status.zoho.com
- Backend: https://banxway-api.../health

3. **Contact Support:**
- **Exotel Issues:** support@exotel.com
- **Zoho Issues:** support@zoho.com
- **Platform Issues:** Create GitHub issue with debug info

4. **Useful SQL Queries:**
```sql
-- Check all integrations
SELECT * FROM integration_credentials;

-- Check phone numbers
SELECT * FROM organization_phone_numbers;

-- Check recent audit logs
SELECT * FROM integration_audit_logs ORDER BY created_at DESC LIMIT 50;

-- Check user permissions
SELECT * FROM user_integration_permissions;
```

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
