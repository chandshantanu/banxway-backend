#!/bin/bash

# Migration 012: Rate Management System
# This script runs the migration on production Supabase database

echo "🚀 Running Migration 012: Rate Management System"
echo "📍 Target: Production Supabase Database"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ psql is not installed. Please install PostgreSQL client first."
    echo "   macOS: brew install postgresql"
    echo "   Ubuntu: sudo apt-get install postgresql-client"
    exit 1
fi

# Prompt for database password
echo "Please enter the Supabase database password:"
echo "(Get it from: https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/settings/database)"
echo ""
read -s DB_PASSWORD

if [ -z "$DB_PASSWORD" ]; then
    echo "❌ Password cannot be empty"
    exit 1
fi

# Connection string
DATABASE_URL="postgresql://postgres.thaobumtmokgayljvlgn:${DB_PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"

echo ""
echo "🔌 Connecting to database..."
echo ""

# Run migration
psql "$DATABASE_URL" -f database/migrations/012_rate_management.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "✅ Migration 012 completed successfully!"
    echo "═══════════════════════════════════════════════════════"
    echo ""
    echo "📦 Created:"
    echo "   ✅ Enum types: rate_card_status, rate_type, quote_source_mode, quote_request_status"
    echo "   ✅ shippers table (Airlines, Shipping Lines, GSAs)"
    echo "   ✅ rate_cards table (Pre-negotiated rates - Inventory Mode)"
    echo "   ✅ shipper_quote_requests table (On-demand quotes)"
    echo "   ✅ Enhanced quotations table with source tracking"
    echo "   ✅ Views: active_rate_cards, pending_shipper_quotes"
    echo "   ✅ Functions: calculate_freight_cost()"
    echo "   ✅ Sample data: 3 shippers, 1 rate card (Mumbai → Dubai)"
    echo ""
    echo "🔍 Verify with:"
    echo "   SELECT * FROM shippers;"
    echo "   SELECT * FROM active_rate_cards;"
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    exit 1
fi
