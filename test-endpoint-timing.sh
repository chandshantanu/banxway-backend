#!/bin/bash

echo "🧪 Testing Backend Endpoint Timing"
echo "===================================="
echo ""

API_URL="https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io"

echo "Test 1: Health Check (no auth)"
time curl -s -o /dev/null -w "Status: %{http_code}\nTime: %{time_total}s\n" \
  "${API_URL}/api/v1/health" \
  --max-time 10
echo ""

echo "Test 2: Threads endpoint (no auth - should fail quickly)"
time curl -s -w "Status: %{http_code}\nTime: %{time_total}s\n" \
  "${API_URL}/api/v1/communications/threads" \
  --max-time 10 | head -5
echo ""

echo "Test 3: Non-existent endpoint (should 404 quickly)"
time curl -s -o /dev/null -w "Status: %{http_code}\nTime: %{time_total}s\n" \
  "${API_URL}/api/v1/nonexistent" \
  --max-time 10
echo ""

echo "✅ Timing test complete"
