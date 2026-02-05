#!/bin/bash
# Deploy Database Migrations Script
# Deploys workflow system migrations to Supabase

set -e  # Exit on error

echo "🚀 Deploying Workflow System Migrations to Supabase"
echo "─────────────────────────────────────────────────────"

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Check if we're in the right directory
if [ ! -d "database/migrations" ]; then
    echo "❌ Error: database/migrations directory not found"
    echo "   Please run this script from banxway-backend directory"
    exit 1
fi

echo ""
echo "📋 Migrations to deploy:"
echo "   1. 008_workflow_system_enhancements.sql"
echo"   2. 009_seed_freight_workflow_templates.sql"
echo ""

# Option 1: Deploy via Supabase CLI
echo "🔄 Option 1: Deploying via Supabase CLI..."
supabase db push

if [ $? -eq 0 ]; then
    echo "✅ Migrations deployed successfully via Supabase CLI"
else
    echo "⚠️  Supabase CLI deployment failed. Trying direct psql..."
    
    # Option 2: Direct psql connection
    if [ -z "$DATABASE_URL" ]; then
        echo "❌ DATABASE_URL environment variable not set"
        echo "   Set your Supabase connection string:"
        echo "   export DATABASE_URL='postgresql://...'"
        exit 1
    fi
    
    echo "🔄 Deploying via psql..."
    psql "$DATABASE_URL" -f database/migrations/008_workflow_system_enhancements.sql
    psql "$DATABASE_URL" -f database/migrations/009_seed_freight_workflow_templates.sql
    
    if [ $? -eq 0 ]; then
        echo "✅ Migrations deployed successfully via psql"
    else
        echo "❌ Migration deployment failed"
        exit 1
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Workflow system migrations deployed!"
echo ""
echo "📝 Next steps:"
echo "   1. Seed workflow templates:"
echo "      npm run seed:workflows"
echo ""
echo "   2. Verify deployment:"
echo "      psql \$DATABASE_URL -c \"SELECT name, status, is_template FROM workflow_definitions;\""
echo ""
echo "   3. Check event triggers:"
echo "      psql \$DATABASE_URL -c \"SELECT event_type, description, is_active FROM workflow_event_triggers;\""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
