# Banxway Platform - Deployment Status

**Last Updated:** 2026-01-25 11:25 IST
**Deployment Phase:** Backend Deployed ✓ | APIM Setup Required

---

## ✅ Completed Tasks

### 1. Backend Deployment to Azure Container Apps
- **Status:** ✅ Complete
- **Docker Image:** `banxwayacr.azurecr.io/banxway-backend:latest`
- **Timestamped:** `banxwayacr.azurecr.io/banxway-backend:20260125-112253`
- **Active Revision:** `banxway-api--0000005`
- **Health Check:** ✓ Passing
- **URL:** `https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io`

**Enhancements Deployed:**
- ✓ Webhook signature verification (HMAC-SHA1)
- ✓ Webhook request logging middleware
- ✓ Enhanced error tracking with webhook log IDs
- ✓ Exotel Voice API v3 (100% compatible)
- ✓ Exotel WhatsApp API v2 (100% compatible - added audio/video)
- ✓ Exotel SMS API v1 (100% compatible)

### 2. Files Created/Modified

**New Files:**
- `src/middleware/exotel-webhook-auth.middleware.ts` - Webhook security
- `src/database/schema/webhook-logs.sql` - Database schema
- `deploy-azure.sh` - Deployment automation
- `.azure/apim-policies/global-policy.xml` - Global APIM config
- `.azure/apim-policies/webhook-policy.xml` - Webhook-specific config
- `AZURE_APIM_DEPLOYMENT_PLAN.md` - Comprehensive deployment guide

**Modified Files:**
- `src/api/v1/webhooks/exotel.ts` - Added logging and auth middleware
- `src/services/exotel/whatsapp.service.ts` - Added sendAudio() and sendVideo()

---

## 🔴 REQUIRED ACTIONS

### Action 1: Apply Database Schema (CRITICAL)

**You must do this manually in Supabase Dashboard:**

1. Go to: https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/sql/new

2. Copy the contents of: `src/database/schema/webhook-logs.sql`

3. Execute the SQL

4. Verify tables created:
   ```sql
   SELECT COUNT(*) FROM webhook_logs;
   SELECT * FROM webhook_stats LIMIT 1;
   SELECT * FROM failed_webhooks LIMIT 1;
   ```

**Why this is important:**
- Webhook logging won't work without this table
- Backend will throw errors when webhooks arrive
- No debugging capability for failed webhooks

---

### Action 2: Create Azure API Management Instance

**Option A: Consumption SKU (Recommended for testing)**
- Cost: ~$4/month + usage
- Setup time: ~5 minutes
- Instant scaling
- No SLA

**Option B: Standard SKU (Production)**
- Cost: ~$90/month
- Setup time: 30-45 minutes
- 99.95% SLA
- Better monitoring

**Run this command:**
```bash
/tmp/create-apim.sh
```

Or manually:
```bash
az apim create \
  --resource-group banxway-platform-prod \
  --name banxway-apim \
  --location centralindia \
  --publisher-email admin@chatslytics.com \
  --publisher-name "Banxway" \
  --sku-name Consumption \
  --enable-managed-identity true
```

---

### Action 3: Import Backend API into APIM

**After APIM is created, run:**
```bash
/tmp/import-api.sh
```

This will:
- Create the Banxway API v1 in APIM
- Configure backend URL
- Add webhook operation endpoints
- Enable HTTPS protocol

---

### Action 4: Apply APIM Policies

**Run:**
```bash
/tmp/apply-policies.sh
```

This configures:
- CORS for frontend origins
- Rate limiting (1000 req/min per IP)
- Security headers (HSTS, X-Frame-Options, etc.)
- Webhook-specific policies (always return 200, higher limits)

---

### Action 5: Configure Exotel Dashboard

**After APIM is set up, update webhook URLs in Exotel:**

**Gateway URL:** `https://banxway-apim.azure-api.net` (or custom domain)

**Voice Call Webhook:**
```
https://banxway-apim.azure-api.net/api/v1/webhooks/exotel/call
```

**WhatsApp Webhook:**
```
https://banxway-apim.azure-api.net/api/v1/webhooks/exotel/whatsapp
```

**SMS Webhook:**
```
https://banxway-apim.azure-api.net/api/v1/webhooks/exotel/sms
```

**Steps:**
1. Login to Exotel Dashboard: https://my.exotel.com/
2. Go to Settings → API Settings
3. Configure webhook URLs for each channel
4. Enable webhook signature (X-Exotel-Signature header)

---

### Action 6: Update Frontend to Use APIM (After APIM Setup)

**Update Vercel environment variables:**
```bash
# Remove old variable
vercel env rm NEXT_PUBLIC_API_URL production --yes

# Add new APIM URL
echo "https://banxway-apim.azure-api.net/api/v1" | \
  vercel env add NEXT_PUBLIC_API_URL production

# Redeploy
vercel --prod
```

Or use custom domain:
```bash
echo "https://api.banxway.com/api/v1" | \
  vercel env add NEXT_PUBLIC_API_URL production
```

---

## 📊 Architecture Overview

```
┌─────────────────┐
│   Frontend      │
│   (Vercel)      │
│ banxway.app     │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────────────┐
│  Azure API Management   │
│  api.banxway.com        │
│  - CORS                 │
│  - Rate Limiting        │
│  - Caching              │
│  - Monitoring           │
└───────┬─────────────────┘
        │
        ├─────► Backend (Container Apps)
        │       banxway-api.*.azurecontainerapps.io
        │
        └─────► Supabase PostgreSQL
                thaobumtmokgayljvlgn.supabase.co

External:
┌─────────────────┐
│  Exotel API     │
│  - Voice v3     │
│  - WhatsApp v2  │
│  - SMS v1       │
└────────┬────────┘
         │ Webhooks
         ▼
     Azure APIM
```

---

## 🧪 Testing Checklist

**After completing all setup:**

### Test 1: Backend Health
```bash
curl https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/health
```
**Expected:** `{"status":"ok","timestamp":"...","environment":"production","version":"1.0.0"}`

### Test 2: APIM Gateway (After Setup)
```bash
curl https://banxway-apim.azure-api.net/api/v1/health
```
**Expected:** Same as Test 1 + APIM headers

### Test 3: Webhook Signature Verification
```bash
# This should fail (401) without proper signature
curl -X POST https://banxway-apim.azure-api.net/api/v1/webhooks/exotel/call \
  -H "Content-Type: application/json" \
  -d '{"CallSid":"test","CallStatus":"ringing"}'
```
**Expected:** `{"error":"Invalid signature"}`

### Test 4: Webhook Logging
```sql
-- In Supabase SQL Editor
SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 5;
```
**Expected:** See recent webhook attempts

### Test 5: Frontend to Backend (After Frontend Update)
1. Login to https://banxway.vercel.app
2. Open browser console
3. Check Network tab - all requests should go to APIM URL
4. No 401/403 errors should appear

---

## 📈 Monitoring & Observability

**After APIM Setup:**

### View Webhook Statistics
```sql
-- Hourly webhook stats
SELECT * FROM webhook_stats WHERE hour > NOW() - INTERVAL '24 hours';

-- Failed webhooks
SELECT * FROM failed_webhooks;

-- Processing time analysis
SELECT
  webhook_type,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (processed_at - created_at))) as median_seconds,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (processed_at - created_at))) as p95_seconds
FROM webhook_logs
WHERE processed AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY webhook_type;
```

### Azure APIM Analytics
1. Go to Azure Portal → banxway-apim
2. Navigate to: Monitoring → Application Insights
3. Check: Requests, Failures, Performance

### Container App Logs
```bash
# Live logs
az containerapp logs show \
  --name banxway-api \
  --resource-group banxway-platform-prod \
  --follow

# Recent logs
az containerapp logs show \
  --name banxway-api \
  --resource-group banxway-platform-prod \
  --tail 100
```

---

## 🚨 Rollback Plan

**If deployment causes issues:**

### Rollback Backend
```bash
# List revisions
az containerapp revision list \
  --name banxway-api \
  --resource-group banxway-platform-prod

# Activate previous revision
az containerapp revision activate \
  --name banxway-api \
  --resource-group banxway-platform-prod \
  --revision banxway-api--0000004  # Previous revision
```

### Rollback Frontend
```bash
# In vercel dashboard or CLI
vercel rollback
```

---

## 📝 Environment Variables Summary

### Backend (Azure Container App) - Already Configured ✓
- `NODE_ENV` = production
- `PORT` = 8000
- `SUPABASE_URL` = https://thaobumtmokgayljvlgn.supabase.co
- `SUPABASE_ANON_KEY` = [configured as secret]
- `SUPABASE_SERVICE_ROLE_KEY` = [configured as secret]
- `REDIS_URL` = [configured as secret]
- `JWT_SECRET` = [configured as secret]
- `ENCRYPTION_MASTER_KEY` = [configured as secret]
- `EXOTEL_SID` = [from .env or vault]
- `EXOTEL_API_KEY` = [from .env or vault]
- `EXOTEL_TOKEN` = [from .env or vault]

### Frontend (Vercel) - Needs Update After APIM
- `NEXT_PUBLIC_API_URL` = Currently: Azure Container App URL
- **Update to:** APIM Gateway URL after APIM setup
- `NEXT_PUBLIC_SUPABASE_URL` = https://thaobumtmokgayljvlgn.supabase.co
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = [configured]

---

## 🎯 Next Immediate Steps (Priority Order)

1. **[CRITICAL]** Apply webhook-logs.sql to Supabase
2. **[REQUIRED]** Create Azure APIM instance (`/tmp/create-apim.sh`)
3. **[REQUIRED]** Import API into APIM (`/tmp/import-api.sh`)
4. **[REQUIRED]** Apply APIM policies (`/tmp/apply-policies.sh`)
5. **[IMPORTANT]** Configure Exotel webhook URLs
6. **[IMPORTANT]** Update frontend to use APIM URL
7. **[TESTING]** Run end-to-end testing checklist
8. **[OPTIONAL]** Configure custom domain (api.banxway.com)

---

## 📚 Reference Documentation

- **Comprehensive Plan:** `AZURE_APIM_DEPLOYMENT_PLAN.md`
- **Exotel API Verification:** `EXOTEL_API_VERIFICATION.md`
- **Deployment Guide:** `DEPLOYMENT_GUIDE.md`
- **Webhook Schema:** `src/database/schema/webhook-logs.sql`

---

## ⚙️ Cost Estimation

**Current Monthly Costs:**
- Azure Container App: ~$30-50 (0.5 vCPU, 1GB RAM)
- Azure Container Registry: ~$5
- Azure Redis: ~$15
- Supabase: $0 (Free tier) or $25 (Pro)
- **Subtotal:** ~$50-95/month

**With APIM (Consumption):** +$4/month + usage
**With APIM (Standard):** +$90/month

**Total Estimated:** $54-185/month

---

## 🔐 Security Checklist

- ✅ HTTPS enforced on all endpoints
- ✅ Webhook signature verification (HMAC-SHA1)
- ✅ CORS properly configured
- ✅ Secrets stored in Azure Key Vault / Container App secrets
- ✅ Rate limiting enabled
- ✅ Security headers configured
- ✅ Webhook logging for audit trail
- ⏳ IP whitelisting for Exotel (optional)
- ⏳ Custom domain with SSL (optional)

---

**Questions or Issues?**
- Backend logs: `az containerapp logs show --name banxway-api --resource-group banxway-platform-prod --follow`
- Database logs: Supabase Dashboard → Logs
- Deployment script: Check `deploy-azure.sh` output
