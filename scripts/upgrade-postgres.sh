#!/bin/bash
# Upgrade Azure PostgreSQL Flexible Server from B1ms to B2s
# Run: bash scripts/upgrade-postgres.sh

set -euo pipefail

RESOURCE_GROUP="banxway-platform-prod"
SERVER_NAME=$(az postgres flexible-server list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv)

if [ -z "$SERVER_NAME" ]; then
  echo "ERROR: No PostgreSQL server found in resource group $RESOURCE_GROUP"
  exit 1
fi

echo "Current SKU:"
az postgres flexible-server show --name "$SERVER_NAME" --resource-group "$RESOURCE_GROUP" --query "{name:name, sku:sku, storage:storage}" -o table

echo ""
echo "Upgrading $SERVER_NAME from B1ms to B2s (2 vCores, 4GB RAM)..."
echo "This will cause a brief restart (~30 seconds downtime)."
read -p "Continue? (y/N): " confirm
if [ "$confirm" != "y" ]; then
  echo "Aborted."
  exit 0
fi

az postgres flexible-server update \
  --name "$SERVER_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --sku-name Standard_B2s \
  --tier Burstable

echo ""
echo "Upgrade complete. New SKU:"
az postgres flexible-server show --name "$SERVER_NAME" --resource-group "$RESOURCE_GROUP" --query "{name:name, sku:sku}" -o table
