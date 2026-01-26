#!/bin/bash

# Banxway Workers Deployment to Azure Container Apps
# This script deploys scalable workers with auto-scaling enabled

set -e

# Configuration
RESOURCE_GROUP="banxway-platform-prod"
LOCATION="centralindia"
ENVIRONMENT="banxway-env"
ACR_NAME="banxwayacr"
IMAGE_TAG="latest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Banxway Workers Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI is not installed${NC}"
    exit 1
fi

# Login check
echo -e "${YELLOW}Checking Azure login...${NC}"
az account show > /dev/null 2>&1 || az login

# Build and push Docker image
echo -e "${YELLOW}Building Docker image...${NC}"
az acr build \
  --registry $ACR_NAME \
  --image banxway-backend:$IMAGE_TAG \
  --file Dockerfile \
  .

echo -e "${GREEN}✓ Docker image built and pushed${NC}"

# Deploy Email Poller Worker
echo -e "${YELLOW}Deploying Email Poller Worker...${NC}"
az containerapp create \
  --name banxway-email-poller \
  --resource-group $RESOURCE_GROUP \
  --environment $ENVIRONMENT \
  --image $ACR_NAME.azurecr.io/banxway-backend:$IMAGE_TAG \
  --command "npm" "run" "worker:email-poller" \
  --cpu 0.5 --memory 1.0Gi \
  --min-replicas 1 \
  --max-replicas 5 \
  --scale-rule-name queue-scale \
  --scale-rule-type azure-queue \
  --scale-rule-metadata "queueName=email-processing" "queueLength=10" \
  --env-vars \
    NODE_ENV=production \
    REDIS_URL=secretref:redis-url \
    SUPABASE_URL=secretref:supabase-url \
    SUPABASE_SERVICE_ROLE_KEY=secretref:supabase-service-key \
    EMAIL_POLL_INTERVAL=30000 \
    WORKER_CONCURRENCY=5 \
  --registry-server $ACR_NAME.azurecr.io \
  --registry-identity system \
  --ingress external \
  --target-port 8000 \
  2>/dev/null || az containerapp update \
  --name banxway-email-poller \
  --resource-group $RESOURCE_GROUP \
  --image $ACR_NAME.azurecr.io/banxway-backend:$IMAGE_TAG

echo -e "${GREEN}✓ Email Poller Worker deployed${NC}"

# Deploy WhatsApp Worker
echo -e "${YELLOW}Deploying WhatsApp Worker...${NC}"
az containerapp create \
  --name banxway-whatsapp-worker \
  --resource-group $RESOURCE_GROUP \
  --environment $ENVIRONMENT \
  --image $ACR_NAME.azurecr.io/banxway-backend:$IMAGE_TAG \
  --command "npm" "run" "worker:whatsapp" \
  --cpu 0.5 --memory 1.0Gi \
  --min-replicas 2 \
  --max-replicas 10 \
  --scale-rule-name queue-scale \
  --scale-rule-type azure-queue \
  --scale-rule-metadata "queueName=whatsapp-processing" "queueLength=20" \
  --env-vars \
    NODE_ENV=production \
    REDIS_URL=secretref:redis-url \
    SUPABASE_URL=secretref:supabase-url \
    SUPABASE_SERVICE_ROLE_KEY=secretref:supabase-service-key \
    EXOTEL_SID=secretref:exotel-sid \
    EXOTEL_TOKEN=secretref:exotel-token \
    EXOTEL_API_KEY=secretref:exotel-api-key \
    EXOTEL_WHATSAPP_NUMBER=secretref:exotel-whatsapp-number \
    WORKER_CONCURRENCY=10 \
  --registry-server $ACR_NAME.azurecr.io \
  --registry-identity system \
  2>/dev/null || az containerapp update \
  --name banxway-whatsapp-worker \
  --resource-group $RESOURCE_GROUP \
  --image $ACR_NAME.azurecr.io/banxway-backend:$IMAGE_TAG

echo -e "${GREEN}✓ WhatsApp Worker deployed${NC}"

# Deploy Transcription Worker
echo -e "${YELLOW}Deploying Transcription Worker...${NC}"
az containerapp create \
  --name banxway-transcription-worker \
  --resource-group $RESOURCE_GROUP \
  --environment $ENVIRONMENT \
  --image $ACR_NAME.azurecr.io/banxway-backend:$IMAGE_TAG \
  --command "npm" "run" "worker:transcription" \
  --cpu 1.0 --memory 2.0Gi \
  --min-replicas 1 \
  --max-replicas 3 \
  --scale-rule-name queue-scale \
  --scale-rule-type azure-queue \
  --scale-rule-metadata "queueName=transcription-processing" "queueLength=5" \
  --env-vars \
    NODE_ENV=production \
    REDIS_URL=secretref:redis-url \
    SUPABASE_URL=secretref:supabase-url \
    SUPABASE_SERVICE_ROLE_KEY=secretref:supabase-service-key \
    OPENAI_API_KEY=secretref:openai-api-key \
    WORKER_CONCURRENCY=3 \
  --registry-server $ACR_NAME.azurecr.io \
  --registry-identity system \
  2>/dev/null || az containerapp update \
  --name banxway-transcription-worker \
  --resource-group $RESOURCE_GROUP \
  --image $ACR_NAME.azurecr.io/banxway-backend:$IMAGE_TAG

echo -e "${GREEN}✓ Transcription Worker deployed${NC}"

# Show deployment status
echo -e "${YELLOW}Checking deployment status...${NC}"
az containerapp list \
  --resource-group $RESOURCE_GROUP \
  --query "[?contains(name, 'worker')].{Name:name, Status:properties.runningStatus, Replicas:properties.template.scale}" \
  --output table

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"

# Show scaling configuration
echo -e "${YELLOW}Auto-scaling configuration:${NC}"
echo "  Email Poller: 1-5 replicas (scales based on queue length)"
echo "  WhatsApp Worker: 2-10 replicas (scales based on queue length)"
echo "  Transcription Worker: 1-3 replicas (scales based on queue length)"

echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Verify workers are running: az containerapp list -g $RESOURCE_GROUP"
echo "  2. Check logs: az containerapp logs show -n banxway-whatsapp-worker -g $RESOURCE_GROUP"
echo "  3. Monitor scaling: az monitor metrics list"
