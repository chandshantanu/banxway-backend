#!/bin/bash
# Script to run migration 012 (cleanup duplicates)

echo "🧹 Running migration 012: Clean duplicate emails..."
echo ""

# Run the migration
cat database/migrations/012_cleanup_duplicate_emails.sql | npx supabase db remote --db-url "$DATABASE_URL"

echo ""
echo "✅ Migration complete!"
echo ""
echo "Verifying results..."
echo ""

# Verify
echo "SELECT COUNT(DISTINCT external_id) as unique_emails, COUNT(*) as total_records FROM communication_messages WHERE external_id IS NOT NULL;" | npx supabase db remote --db-url "$DATABASE_URL"

echo ""
echo "Done!"
