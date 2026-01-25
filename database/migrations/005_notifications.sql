-- Notifications Migration
-- Adds user notification system for task assignments, SLA warnings, etc.
-- Created: 2026-01-25

-- =====================================================
-- NOTIFICATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- User who receives the notification
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Notification type
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'TASK_ASSIGNED',
    'HIGH_PRIORITY',
    'SLA_WARNING',
    'SLA_BREACH',
    'CLIENT_APPROVED',
    'CLIENT_REJECTED',
    'AGENT_ERROR',
    'HANDOFF_REQUEST'
  )),

  -- Content
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,

  -- Optional link to related entity
  request_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES communication_threads(id) ON DELETE CASCADE,
  action_url VARCHAR(500),

  -- Read status
  read_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Query notifications by user
CREATE INDEX idx_notifications_user_id ON notifications(user_id);

-- Query unread notifications
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- Query notifications by creation date
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- Query notifications by type
CREATE INDEX idx_notifications_type ON notifications(type);

-- Composite index for common query: user's recent unread notifications
CREATE INDEX idx_notifications_user_recent_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY notifications_select_own ON notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- System can create notifications (via service role)
CREATE POLICY notifications_insert ON notifications
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR user_id = auth.uid());

-- Users can update (mark read) their own notifications
CREATE POLICY notifications_update_own ON notifications
  FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY notifications_delete_own ON notifications
  FOR DELETE
  USING (user_id = auth.uid());

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to create a notification (callable by services)
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type VARCHAR(50),
  p_title VARCHAR(255),
  p_message TEXT,
  p_request_id UUID DEFAULT NULL,
  p_thread_id UUID DEFAULT NULL,
  p_action_url VARCHAR(500) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    request_id,
    thread_id,
    action_url
  ) VALUES (
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_request_id,
    p_thread_id,
    p_action_url
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark all notifications as read for a user
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE notifications
  SET read_at = NOW()
  WHERE user_id = p_user_id
    AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE notifications IS 'User notifications for task assignments, SLA warnings, and other events';
COMMENT ON COLUMN notifications.type IS 'Type of notification (TASK_ASSIGNED, SLA_WARNING, etc.)';
COMMENT ON COLUMN notifications.read_at IS 'Timestamp when notification was marked as read (NULL = unread)';
COMMENT ON COLUMN notifications.request_id IS 'Optional reference to related shipment';
COMMENT ON COLUMN notifications.thread_id IS 'Optional reference to related communication thread';
COMMENT ON COLUMN notifications.action_url IS 'Optional URL for user action (e.g., /requests/123/review)';
