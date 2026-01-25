#!/bin/bash

# =====================================================
# Azure Deployment Script for Banxway Backend
# =====================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Banxway Backend - Azure Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Configuration
RESOURCE_GROUP="banxway-platform-prod"
CONTAINER_APP_NAME="banxway-api"
ACR_NAME="banxwayacr"
IMAGE_NAME="banxway-backend"
LOCATION="centralindia"

# Get current timestamp for tagging
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
IMAGE_TAG_LATEST="${IMAGE_NAME}:latest"
IMAGE_TAG_TIMESTAMPED="${IMAGE_NAME}:${TIMESTAMP}"

echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Container App: $CONTAINER_APP_NAME"
echo "  ACR: $ACR_NAME"
echo "  Image: $IMAGE_TAG_LATEST"
echo "  Timestamped Image: $IMAGE_TAG_TIMESTAMPED"
echo ""

# Step 1: Check if logged in to Azure
echo -e "${YELLOW}Step 1: Checking Azure login...${NC}"
if ! az account show &> /dev/null; then
    echo -e "${RED}Not logged in to Azure. Please run 'az login' first.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Logged in to Azure${NC}"

# Step 2: Build and push Docker image
echo ""
echo -e "${YELLOW}Step 2: Building and pushing Docker image...${NC}"
echo "This may take 3-5 minutes..."

az acr build \
  --registry $ACR_NAME \
  --image $IMAGE_TAG_LATEST \
  --image $IMAGE_TAG_TIMESTAMPED \
  --file Dockerfile \
  . || { echo -e "${RED}✗ Docker build failed${NC}"; exit 1; }

echo -e "${GREEN}✓ Docker image built and pushed${NC}"

# Step 3: Apply database schema
echo ""
echo -e "${YELLOW}Step 3: Apply database schema updates?${NC}"
read -p "Apply webhook-logs.sql to Supabase? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Please run the following SQL in Supabase Dashboard:"
    echo "  1. Go to: https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/sql/new"
    echo "  2. Copy: src/database/schema/webhook-logs.sql"
    echo "  3. Execute"
    read -p "Press enter when done..."
fi

# Step 4: Update Container App
echo ""
echo -e "${YELLOW}Step 4: Updating Container App...${NC}"
echo "The Container App will auto-update with the new image."
echo "Checking current revision..."

CURRENT_REVISION=$(az containerapp revision list \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "[?properties.active==\`true\`].name" \
  --output tsv)

echo "Current active revision: $CURRENT_REVISION"

# Optional: Force update
read -p "Force a new revision? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    az containerapp update \
      --name $CONTAINER_APP_NAME \
      --resource-group $RESOURCE_GROUP \
      --image ${ACR_NAME}.azurecr.io/${IMAGE_TAG_LATEST}
fi

# Step 5: Wait for new revision
echo ""
echo -e "${YELLOW}Step 5: Waiting for new revision...${NC}"
sleep 10

NEW_REVISION=$(az containerapp revision list \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "[?properties.active==\`true\`].name" \
  --output tsv)

echo "New active revision: $NEW_REVISION"

# Step 6: Health check
echo ""
echo -e "${YELLOW}Step 6: Running health check...${NC}"
BACKEND_URL="https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io"

sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" ${BACKEND_URL}/health)

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo -e "${GREEN}✓ Health check passed (HTTP $HTTP_STATUS)${NC}"
    echo ""
    echo "Testing health endpoint:"
    curl -s ${BACKEND_URL}/health | python3 -m json.tool
else
    echo -e "${RED}✗ Health check failed (HTTP $HTTP_STATUS)${NC}"
    echo ""
    echo "Checking logs..."
    az containerapp logs show \
      --name $CONTAINER_APP_NAME \
      --resource-group $RESOURCE_GROUP \
      --tail 50
    exit 1
fi

# Step 7: Deployment summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "✓ Docker image: ${ACR_NAME}.azurecr.io/${IMAGE_TAG_LATEST}"
echo "✓ Timestamped image: ${ACR_NAME}.azurecr.io/${IMAGE_TAG_TIMESTAMPED}"
echo "✓ Active revision: $NEW_REVISION"
echo "✓ Backend URL: $BACKEND_URL"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Test webhook endpoints:"
echo "   curl -X POST ${BACKEND_URL}/api/v1/webhooks/exotel/call -d '{...}'"
echo ""
echo "2. Check webhook logs in Supabase:"
echo "   SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 10;"
echo ""
echo "3. Monitor Container App:"
echo "   az containerapp logs show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --follow"
echo ""
echo "4. Update frontend environment variable (if using APIM):"
echo "   vercel env add NEXT_PUBLIC_API_URL production"
echo "   Enter: https://api.banxway.com/api/v1"
echo ""
echo -e "${GREEN}Deployment complete!${NC}"
