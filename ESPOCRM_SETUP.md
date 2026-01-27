# EspoCRM Integration Setup Guide

## Overview

This guide provides step-by-step instructions for deploying and configuring EspoCRM to integrate with the Banxway freight forwarding platform.

## Prerequisites

- Docker and Docker Compose installed
- Port 8080 and 8081 available (or configure custom ports)
- At least 2GB RAM available for containers

## Step 1: Environment Configuration

1. Copy the example environment file:
```bash
cp .env.espocrm.example .env.espocrm
```

2. Edit `.env.espocrm` and set your values:
```bash
# Required - Change these!
ESPOCRM_DB_ROOT_PASSWORD=SecureRootPassword123!
ESPOCRM_DB_PASSWORD=SecureDBPassword123!
ESPOCRM_ADMIN_PASSWORD=SecureAdminPassword123!

# Optional - Generate API key after installation
ESPOCRM_API_KEY=will_be_generated_after_setup
```

## Step 2: Deploy EspoCRM

1. Start the containers:
```bash
docker-compose -f docker-compose.espocrm.yml --env-file .env.espocrm up -d
```

2. Wait for containers to be healthy (30-60 seconds):
```bash
docker-compose -f docker-compose.espocrm.yml ps
```

3. Access EspoCRM:
- EspoCRM: http://localhost:8080
- phpMyAdmin: http://localhost:8081 (optional)

4. Complete the installation wizard:
- Language: English
- Database: Already configured via environment variables
- Admin credentials: Use values from `.env.espocrm`

## Step 3: Configure Custom Fields

After installation, configure custom fields for Banxway integration:

### Account Entity (Customer)

Navigate to: **Administration → Entity Manager → Account → Fields**

Create the following custom fields:

1. **Customer Code**
   - Type: Varchar
   - Name: `customerCode`
   - Max Length: 50
   - Required: Yes
   - Unique: Yes

2. **GST Number**
   - Type: Varchar
   - Name: `gstNumber`
   - Max Length: 50

3. **PAN Number**
   - Type: Varchar
   - Name: `panNumber`
   - Max Length: 50

4. **IEC Number**
   - Type: Varchar
   - Name: `iecNumber`
   - Max Length: 50

5. **Customer Tier**
   - Type: Enum
   - Name: `customerTier`
   - Options: NEW, BRONZE, SILVER, GOLD, PLATINUM
   - Default: NEW

6. **Credit Terms**
   - Type: Enum
   - Name: `creditTerms`
   - Options: ADVANCE, COD, NET_7, NET_15, NET_30, NET_45, NET_60, NET_90
   - Default: ADVANCE

7. **Credit Limit USD**
   - Type: Currency
   - Name: `creditLimitUsd`
   - Default Currency: USD

8. **Outstanding Balance USD**
   - Type: Currency
   - Name: `outstandingBalanceUsd`
   - Default Currency: USD

9. **KYC Status**
   - Type: Enum
   - Name: `kycStatus`
   - Options: PENDING, SUBMITTED, VERIFIED, REJECTED
   - Default: PENDING

10. **Banxway ID**
    - Type: Varchar
    - Name: `banxwayId`
    - Max Length: 100
    - Tooltip: "ID in Banxway system"

### Contact Entity

Navigate to: **Administration → Entity Manager → Contact → Fields**

Create the following custom fields:

1. **Designation**
   - Type: Varchar
   - Name: `designation`
   - Max Length: 100

2. **Department**
   - Type: Varchar
   - Name: `department`
   - Max Length: 100

3. **Mobile**
   - Type: Phone
   - Name: `mobile`

4. **Is Primary Contact**
   - Type: Bool
   - Name: `isPrimaryContact`
   - Default: No

5. **Banxway ID**
   - Type: Varchar
   - Name: `banxwayId`
   - Max Length: 100

### Opportunity Entity (Quotation)

Navigate to: **Administration → Entity Manager → Opportunity → Fields**

Create the following custom fields:

1. **Quote Number**
   - Type: Varchar
   - Name: `quoteNumber`
   - Max Length: 50
   - Unique: Yes

2. **Shipment Type**
   - Type: Enum
   - Name: `shipmentType`
   - Options: AIR_IMPORT, AIR_EXPORT, ODC_IMPORT, ODC_EXPORT, BREAK_BULK_IMPORT, BREAK_BULK_EXPORT, SEA_AIR_THIRD_COUNTRY

3. **Origin Location**
   - Type: Varchar
   - Name: `originLocation`
   - Max Length: 255

4. **Destination Location**
   - Type: Varchar
   - Name: `destinationLocation`
   - Max Length: 255

5. **Valid From**
   - Type: Date
   - Name: `validFrom`

6. **Valid Until**
   - Type: Date
   - Name: `validUntil`

7. **Banxway ID**
   - Type: Varchar
   - Name: `banxwayId`
   - Max Length: 100

## Step 4: Generate API Key

1. Navigate to: **Administration → API Users**
2. Click **Create API User**
3. Fill in details:
   - Username: `banxway-integration`
   - Is Active: Yes
   - Is Admin: No
4. Click **Save**
5. Copy the generated **API Key**
6. Update `.env.espocrm` with the API key:
   ```bash
   ESPOCRM_API_KEY=the_generated_api_key_here
   ```
7. Restart Banxway backend to pick up the new API key

## Step 5: Configure Webhooks

EspoCRM will send webhooks to Banxway when records are created/updated.

1. Navigate to: **Administration → Webhooks**
2. Create webhook for **Account** updates:
   - Event: `Account.create`, `Account.update`
   - URL: `https://your-banxway-backend.com/api/v1/webhooks/espocrm/account`
   - Method: POST
   - Headers:
     ```
     Content-Type: application/json
     X-Webhook-Secret: your_webhook_secret_here
     ```
   - Status: Active

3. Create webhook for **Contact** updates:
   - Event: `Contact.create`, `Contact.update`
   - URL: `https://your-banxway-backend.com/api/v1/webhooks/espocrm/contact`
   - Method: POST
   - Headers: (same as above)
   - Status: Active

4. Create webhook for **Opportunity** updates:
   - Event: `Opportunity.create`, `Opportunity.update`
   - URL: `https://your-banxway-backend.com/api/v1/webhooks/espocrm/opportunity`
   - Method: POST
   - Headers: (same as above)
   - Status: Active

## Step 6: Update Banxway Backend Configuration

Add the following to your Banxway backend `.env` file:

```bash
# EspoCRM Integration
ESPOCRM_ENABLED=true
ESPOCRM_API_URL=http://localhost:8080/api/v1
ESPOCRM_API_KEY=your_api_key_from_step_4
ESPOCRM_WEBHOOK_SECRET=your_webhook_secret_here
```

Restart the Banxway backend:
```bash
npm run dev
# or in production
pm2 restart banxway-backend
```

## Step 7: Test Integration

### Test Sync from Banxway to EspoCRM

1. Create a customer in Banxway:
```bash
curl -X POST http://localhost:8000/api/v1/crm/customers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "legal_name": "Test Corp Ltd",
    "primary_email": "contact@testcorp.com",
    "gst_number": "29ABCDE1234F1Z5",
    "customer_tier": "BRONZE"
  }'
```

2. Trigger sync to EspoCRM:
```bash
curl -X POST http://localhost:8000/api/v1/crm/sync-customer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "uuid-from-step-1"
  }'
```

3. Verify in EspoCRM:
   - Navigate to **CRM → Accounts**
   - Find "Test Corp Ltd"
   - Check that custom fields (GST Number, Customer Tier) are populated

### Test Webhook from EspoCRM to Banxway

1. In EspoCRM, edit the "Test Corp Ltd" account
2. Change the Customer Tier to "SILVER"
3. Save the account
4. Check Banxway backend logs:
```bash
docker logs banxway-backend
# Should show: "Received EspoCRM webhook: Account updated"
```

5. Verify update in Banxway database:
```sql
SELECT customer_tier FROM crm_customers WHERE legal_name = 'Test Corp Ltd';
-- Should show: SILVER
```

## Step 8: Production Deployment

### Deploy to Cloud (Azure/AWS/GCP)

1. **Option A: Azure Container Instances**
```bash
# Create resource group
az group create --name espocrm-rg --location centralindia

# Create MySQL database
az mysql flexible-server create \
  --resource-group espocrm-rg \
  --name espocrm-mysql \
  --admin-user espocrm \
  --admin-password SecurePassword123! \
  --sku-name Standard_B1ms \
  --version 8.0

# Deploy EspoCRM container
az container create \
  --resource-group espocrm-rg \
  --name espocrm-app \
  --image espocrm/espocrm:latest \
  --dns-name-label espocrm-banxway \
  --ports 80 \
  --environment-variables \
    ESPOCRM_DATABASE_HOST=espocrm-mysql.mysql.database.azure.com \
    ESPOCRM_DATABASE_NAME=espocrm \
    ESPOCRM_DATABASE_USER=espocrm \
    ESPOCRM_DATABASE_PASSWORD=SecurePassword123! \
    ESPOCRM_SITE_URL=https://espocrm-banxway.centralindia.azurecontainer.io
```

2. **Option B: Docker Compose on VM**
```bash
# SSH to your VM
ssh user@your-vm-ip

# Clone repo
git clone https://github.com/your-org/banxway-backend.git
cd banxway-backend

# Configure environment
cp .env.espocrm.example .env.espocrm
nano .env.espocrm
# Update ESPOCRM_SITE_URL to your domain

# Deploy
docker-compose -f docker-compose.espocrm.yml --env-file .env.espocrm up -d

# Setup HTTPS with Let's Encrypt (optional)
sudo apt install certbot
sudo certbot --nginx -d crm.yourdomain.com
```

## Troubleshooting

### Container Won't Start

Check logs:
```bash
docker-compose -f docker-compose.espocrm.yml logs -f
```

Common issues:
- Port 8080 already in use: Change `ESPOCRM_PORT` in `.env.espocrm`
- Database connection failed: Wait 30 seconds for MySQL to initialize
- Permission denied: Run `sudo chown -R www-data:www-data espocrm-data`

### Sync Not Working

1. Check API key is valid:
```bash
curl http://localhost:8080/api/v1/Account \
  -H "X-Api-Key: your_api_key"
# Should return list of accounts, not 401 Unauthorized
```

2. Check webhook secret matches:
```bash
# In Banxway backend .env
ESPOCRM_WEBHOOK_SECRET=same_value_as_in_espocrm_webhook_config
```

3. Check logs:
```bash
# Banxway backend logs
docker logs banxway-backend | grep -i espocrm

# EspoCRM logs
docker exec -it espocrm-app cat /var/www/html/data/logs/espo.log
```

### Custom Fields Not Showing

1. Clear cache in EspoCRM:
   - Administration → Clear Cache → Clear Cache

2. Rebuild EspoCRM:
   - Administration → Rebuild

3. Refresh browser (Ctrl+F5)

## Monitoring

### Health Checks

```bash
# Check EspoCRM health
curl http://localhost:8080/api/v1/App/user

# Check webhook endpoint
curl https://your-banxway-backend.com/api/v1/webhooks/espocrm/health
```

### Database Backup

```bash
# Backup EspoCRM database
docker exec espocrm-mysql mysqldump -u espocrm -p espocrm > espocrm-backup-$(date +%Y%m%d).sql

# Restore from backup
docker exec -i espocrm-mysql mysql -u espocrm -p espocrm < espocrm-backup-20260126.sql
```

## Uninstall

```bash
# Stop containers
docker-compose -f docker-compose.espocrm.yml down

# Remove volumes (WARNING: This deletes all data!)
docker-compose -f docker-compose.espocrm.yml down -v

# Remove images
docker rmi espocrm/espocrm:latest mysql:8.0 phpmyadmin/phpmyadmin:latest
```

## Support

- EspoCRM Documentation: https://docs.espocrm.com
- Banxway Support: support@banxway.com
- Issues: https://github.com/your-org/banxway-backend/issues
