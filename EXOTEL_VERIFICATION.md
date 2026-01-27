# Exotel Configuration Verification Guide

**Created:** 2026-01-27
**Purpose:** Verify Exotel WhatsApp and Voice integration is properly configured in production

---

## Configuration Status

✅ **CONFIGURED:** All Exotel credentials are documented and stored in Azure secrets

### Current Configuration

**Account Details:**
- **SID:** chatslytics1
- **API Key:** Stored in Azure secret: `exotel-api-key`
- **API Token:** Stored in Azure secret: `exotel-token`
- **Dashboard:** https://my.exotel.com/chatslytics1

**Phone Numbers:**
- **Voice:** 01141169368
- **SMS:** 01141169368
- **WhatsApp:** 01141169368

**Webhook Base URL:**
```
https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io
```

---

## Verification Steps

### Step 1: Verify Azure Secrets Exist

```bash
# List all secrets in the Azure Container App
az containerapp secret list \
  --name banxway-api \
  --resource-group banxway-platform-prod \
  --output table

# Should show:
# - exotel-api-key
# - exotel-token
# - jwt-secret
# - supabase-service-role-key
# - redis-url
```

### Step 2: Verify Environment Variables in Azure

```bash
# Check environment variables
az containerapp env list \
  --name banxway-api \
  --resource-group banxway-platform-prod

# Verify these variables exist:
# - EXOTEL_SID=chatslytics1
# - EXOTEL_PHONE_NUMBER=01141169368
# - EXOTEL_SMS_NUMBER=01141169368
# - EXOTEL_WHATSAPP_NUMBER=01141169368
# - EXOTEL_API_URL=https://api.exotel.com
# - EXOTEL_WEBHOOK_BASE_URL=https://banxway-api...
```

### Step 3: Verify Webhooks in Exotel Dashboard

**Login:** https://my.exotel.com/chatslytics1

**Check Webhook Configuration:**

1. **Call Status Webhook:**
   ```
   URL: https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/webhooks/exotel/call
   Method: POST
   Events: call.initiated, call.ringing, call.answered, call.completed, call.failed
   ```

2. **WhatsApp Message Webhook:**
   ```
   URL: https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/webhooks/exotel/whatsapp
   Method: POST
   Events: message.received, message.sent, message.delivered, message.read, message.failed
   ```

3. **SMS Status Webhook:**
   ```
   URL: https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/webhooks/exotel/sms
   Method: POST
   Events: sms.sent, sms.delivered, sms.failed
   ```

**Important:** Webhooks must be publicly accessible (not localhost). Azure Container App URL should work.

### Step 4: Test WhatsApp Send API

```bash
# Get authentication token first
TOKEN="your-jwt-token"

# Test WhatsApp message send
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/communications/messages/send-whatsapp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "threadId": "test-thread-id",
    "to": "+919876543210",
    "content": "Test message from Banxway"
  }'

# Expected Response:
# {
#   "success": true,
#   "data": {
#     "id": "message-id",
#     "external_id": "exotel-message-id",
#     "status": "PENDING",
#     "channel": "WHATSAPP"
#   }
# }
```

### Step 5: Test Click-to-Call API

```bash
# Test voice call
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/communications/messages/make-call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "threadId": "test-thread-id",
    "to": "+919876543210"
  }'

# Expected Response:
# {
#   "success": true,
#   "data": {
#     "id": "call-id",
#     "external_id": "exotel-call-id",
#     "status": "INITIATED",
#     "channel": "VOICE"
#   }
# }
```

### Step 6: Test Webhook Reception

**Send test WhatsApp message to 01141169368**

Monitor backend logs:
```bash
# View logs in Azure
az containerapp logs show \
  --name banxway-api \
  --resource-group banxway-platform-prod \
  --follow

# Look for:
# ✅ "Received Exotel WhatsApp webhook"
# ✅ "Webhook signature verified"
# ✅ "WhatsApp message processed"
# ✅ "WebSocket event emitted: message:new"
```

### Step 7: Verify Database Records

```sql
-- Check messages were created
SELECT
  id,
  channel,
  external_id,
  status,
  direction,
  created_at,
  sent_at,
  delivered_at
FROM communication_messages
WHERE channel IN ('WHATSAPP', 'VOICE')
ORDER BY created_at DESC
LIMIT 10;

-- Check threads were updated
SELECT
  id,
  last_activity_at,
  last_message_at,
  message_count
FROM communication_threads
WHERE shipment_id IS NOT NULL
ORDER BY last_activity_at DESC
LIMIT 5;
```

---

## Common Issues & Solutions

### Issue 1: Webhook Not Receiving Calls

**Symptoms:**
- Messages sent successfully but status never updates
- No webhook logs in Azure

**Solutions:**
1. Verify webhook URL is publicly accessible (not localhost)
2. Check Azure Container App is running: `az containerapp show --name banxway-api --resource-group banxway-platform-prod`
3. Verify Exotel dashboard has correct webhook URLs
4. Check firewall/security group allows incoming requests from Exotel IPs

### Issue 2: Authentication Failure

**Symptoms:**
- 401 Unauthorized errors
- "Invalid credentials" in Exotel API responses

**Solutions:**
1. Verify API Key and Token are correct in Azure secrets
2. Check credentials haven't expired in Exotel dashboard
3. Ensure EXOTEL_SID matches account (chatslytics1)

### Issue 3: Webhook Signature Verification Failed

**Symptoms:**
- "Invalid webhook signature" errors in logs
- Webhooks rejected by backend

**Solutions:**
1. Verify EXOTEL_TOKEN matches Exotel dashboard token
2. Check webhook signature validation in `/webhooks/exotel.ts`
3. Temporarily disable signature check for debugging (NOT in production)

### Issue 4: WhatsApp Number Not Provisioned

**Symptoms:**
- "WhatsApp number not found" errors
- Messages fail to send

**Solutions:**
1. Verify WhatsApp number is provisioned in Exotel dashboard
2. Check business verification status (WhatsApp Business API requires verification)
3. Ensure number format matches: 01141169368 (no country code for Exotel)

---

## Production Checklist

Before using in production, verify:

- [ ] All Azure secrets exist and are non-empty
- [ ] Environment variables configured in Azure Container App
- [ ] Webhooks registered in Exotel dashboard
- [ ] Webhook URLs are publicly accessible (not localhost)
- [ ] WhatsApp Business verification complete
- [ ] Test message successfully sent and received
- [ ] Test call successfully initiated and completed
- [ ] Webhooks processing and database updating
- [ ] WebSocket events broadcasting to frontend
- [ ] Timeline showing all communications
- [ ] Call recordings accessible (if enabled)

---

## Next Steps

Once verification is complete:

1. **Add UI Components** (Task #2-5)
   - Create PhoneCallButton component
   - Add to customer detail page
   - Add to contact cards
   - Add to thread headers

2. **User Training**
   - Document click-to-call workflow
   - Document WhatsApp messaging workflow
   - Create video tutorials

3. **Monitoring Setup**
   - Set up Exotel usage alerts
   - Monitor webhook success rate
   - Track message delivery rates
   - Alert on failed calls/messages

---

**Status:** ✅ Configuration Complete - Ready for UI Implementation

**Last Updated:** 2026-01-27
**Next Review:** Before production launch
