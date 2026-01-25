# Deployment Guide - Banxway Platform

## Pre-Deployment Checklist

### ✅ Completed:
- [x] Database schema applied locally
- [x] Integration services implemented (Voice, WhatsApp, SMS)
- [x] Frontend UI created (Settings, Team, Requests)
- [x] Connection buttons fixed
- [x] Error handling enhanced
- [x] Encryption service added
- [x] API verified against Exotel Postman collections (100% match)

### Environment Variables

#### Backend (Vercel/Production):
```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Encryption (REQUIRED)
ENCRYPTION_MASTER_KEY=generate-a-secure-32-character-key-here

# API Base
API_BASE_URL=https://your-backend-domain.vercel.app

# Frontend URL (for OAuth redirects)
FRONTEND_URL=https://your-frontend-domain.vercel.app

# CORS (optional)
ALLOWED_ORIGINS=https://your-frontend-domain.vercel.app

# Note: EXOTEL credentials are now stored in database, not env vars
```

#### Frontend (Vercel):
```env
NEXT_PUBLIC_API_URL=https://your-backend-domain.vercel.app/api/v1
NEXT_PUBLIC_WS_URL=wss://your-backend-domain.vercel.app
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## Deployment Steps

### 1. Deploy Database Schema to Production Supabase

#### Option A: Supabase Dashboard
1. Go to your production Supabase project
2. Navigate to SQL Editor
3. Create new query
4. Copy contents from: `banxway-backend/src/database/schema/integrations.sql`
5. Execute

#### Option B: CLI
```bash
# Connect to production Supabase
supabase link --project-ref your-project-ref

# Push schema
cat banxway-backend/src/database/schema/integrations.sql | \
  supabase db execute --db-url "your-production-db-url"
```

#### Verify Tables:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND (table_name LIKE 'integration%' OR table_name LIKE 'organization_phone%')
ORDER BY table_name;
```

Should return:
- integration_audit_logs
- integration_credentials
- organization_phone_numbers
- user_integration_permissions

---

### 2. Deploy Backend to Vercel

```bash
cd banxway-backend

# Install Vercel CLI if needed
npm i -g vercel

# Deploy
vercel --prod

# Set environment variables
vercel env add ENCRYPTION_MASTER_KEY production
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add FRONTEND_URL production
```

**Vercel Configuration (`vercel.json`):**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/index.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/src/index.ts"
    }
  ]
}
```

---

### 3. Deploy Frontend to Vercel

```bash
cd banxway-platform

# Deploy
vercel --prod

# Set environment variables
vercel env add NEXT_PUBLIC_API_URL production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
```

---

### 4. Post-Deployment Verification

#### Test Backend APIs:
```bash
# Health check
curl https://your-backend.vercel.app/api/v1/settings

# Integrations endpoint
curl https://your-backend.vercel.app/api/v1/settings/integrations \
  -H "Authorization: Bearer your-token"
```

#### Test Frontend:
1. Open: https://your-frontend.vercel.app
2. Login with credentials
3. Go to Settings → Integrations
4. Configure Exotel Phone:
   - Account SID
   - API Key
   - API Token
   - Virtual Number
5. Click "Test Connection" → Should succeed
6. Click "Save Configuration"
7. Go to Settings → Team
8. Verify phone number appears
9. Assign to a user

#### Test Connection Buttons:
1. Dashboard → Communications card
2. Click "Connect now" on Email → Should go to /settings/email-accounts
3. Click "Connect now" on WhatsApp → Should go to /settings/integrations?tab=whatsapp
4. Click "Phone Calls" → Should go to /settings/integrations?tab=phone

---

## Production URLs

After deployment, update these:

| Service | URL |
|---------|-----|
| Frontend | https://your-app.vercel.app |
| Backend API | https://your-api.vercel.app |
| Supabase | https://your-project.supabase.co |

---

## Security Checklist

- [ ] `ENCRYPTION_MASTER_KEY` is set in production
- [ ] Supabase RLS policies enabled
- [ ] API CORS configured properly
- [ ] All sensitive env vars in Vercel (not in code)
- [ ] Database backups enabled
- [ ] SSL/HTTPS enforced

---

## Rollback Plan

If deployment fails:

1. **Frontend**: `vercel rollback` to previous deployment
2. **Backend**: `vercel rollback` to previous deployment
3. **Database**: Restore from Supabase backup

---

## Monitoring

### Check Logs:
```bash
# Frontend logs
vercel logs your-frontend-url

# Backend logs
vercel logs your-backend-url
```

### Monitor Database:
- Supabase Dashboard → Database → Query Performance
- Check `integration_audit_logs` table for activity

---

## Support

If issues occur:
1. Check Vercel deployment logs
2. Check Supabase database logs
3. Verify environment variables are set
4. Test API endpoints individually
5. Check browser console for frontend errors

---

## Next Steps After Deployment

1. Configure Exotel integration via UI
2. Invite team members
3. Assign phone numbers
4. Test making a call
5. Test sending WhatsApp message
6. Monitor audit logs
