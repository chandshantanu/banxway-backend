-- Email count investigation queries

-- 1. Total messages
SELECT COUNT(*) as total_messages 
FROM communication_messages;

-- 2. Unique vs total emails
SELECT 
  COUNT(DISTINCT external_id) as unique_emails,
  COUNT(*) as total_email_records,
  COUNT(*) - COUNT(DISTINCT external_id) as duplicates
FROM communication_messages 
WHERE external_id IS NOT NULL;

-- 3. Top duplicate Message-IDs
SELECT 
  external_id,
  COUNT(*) as duplicate_count
FROM communication_messages 
WHERE external_id IS NOT NULL
GROUP BY external_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 10;

-- 4. Active threads
SELECT COUNT(*) as active_threads 
FROM communication_threads 
WHERE archived = false;

-- 5. Channel breakdown
SELECT 
  channel,
  direction,
  COUNT(*) as count
FROM communication_messages
GROUP BY channel, direction
ORDER BY count DESC;
