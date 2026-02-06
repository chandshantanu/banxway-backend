-- Migration: 016_add_sent_by_fk.sql
-- Purpose: Add sent_by column with FK to users table for communication_messages
-- Created: 2026-02-06

-- Add sent_by column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'communication_messages'
    AND column_name = 'sent_by'
  ) THEN
    ALTER TABLE communication_messages
    ADD COLUMN sent_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

    -- Add index for performance
    CREATE INDEX IF NOT EXISTS idx_messages_sent_by ON communication_messages(sent_by);

    RAISE NOTICE 'Added sent_by column to communication_messages';
  ELSE
    -- Column exists, just ensure FK constraint exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'communication_messages'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.column_name = 'sent_by'
    ) THEN
      -- Add FK constraint if missing
      ALTER TABLE communication_messages
      ADD CONSTRAINT fk_messages_sent_by
      FOREIGN KEY (sent_by) REFERENCES public.users(id) ON DELETE SET NULL;

      RAISE NOTICE 'Added FK constraint for sent_by column';
    ELSE
      RAISE NOTICE 'sent_by column and FK already exist';
    END IF;
  END IF;
END $$;

-- Refresh schema cache (important for Supabase/PostgREST)
NOTIFY pgrst, 'reload schema';
