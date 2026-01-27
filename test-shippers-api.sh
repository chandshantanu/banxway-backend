#!/bin/bash

API_URL="https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api"

echo "🧪 Testing Shippers API Endpoints"
echo "=================================="
echo ""

# Test 1: Health check
echo "1️⃣  Testing Health Check..."
curl -s "${API_URL}/v1/health" | jq '.' || echo "❌ Health check failed"
echo ""

# Test 2: List shippers (no auth - should work with sample data)
echo "2️⃣  Testing GET /v1/shippers..."
curl -s "${API_URL}/v1/shippers" | jq '.data[] | {code: .shipper_code, name: .shipper_name, type: .shipper_type}' || echo "❌ Failed"
echo ""

# Test 3: Check API info
echo "3️⃣  Checking API endpoints..."
curl -s "${API_URL}/v1" | jq '.endpoints.shippers' || echo "❌ Failed"
echo ""

echo "✅ API Tests Complete!"
