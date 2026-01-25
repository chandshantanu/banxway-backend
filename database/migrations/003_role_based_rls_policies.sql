-- Banxway Platform - Role-Based RLS Policies
-- Migration: 003_role_based_rls_policies
-- This migration implements comprehensive role-based access control at the database level

-- =====================================================
-- HELPER FUNCTION: Get user role from users table
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
DECLARE
  user_role_val user_role;
BEGIN
  SELECT role INTO user_role_val
  FROM users
  WHERE id = auth.uid();

  RETURN COALESCE(user_role_val, 'viewer');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user has minimum role level
CREATE OR REPLACE FUNCTION has_min_role(min_role user_role)
RETURNS BOOLEAN AS $$
DECLARE
  current_role user_role;
  role_levels JSONB := '{"viewer": 1, "support": 2, "validator": 3, "manager": 4, "admin": 5}'::jsonb;
BEGIN
  current_role := get_user_role();
  RETURN (role_levels->>current_role)::int >= (role_levels->>min_role::text)::int;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- DROP EXISTING POLICIES (Clean slate)
-- =====================================================
DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;
DROP POLICY IF EXISTS customers_select_authenticated ON customers;

-- =====================================================
-- USERS TABLE POLICIES
-- =====================================================

-- Admins can see all users
CREATE POLICY users_admin_select ON users
  FOR SELECT
  USING (is_admin());

-- Managers can see all users
CREATE POLICY users_manager_select ON users
  FOR SELECT
  USING (get_user_role() = 'manager');

-- All users can see themselves
CREATE POLICY users_self_select ON users
  FOR SELECT
  USING (auth.uid() = id);

-- Only admins can create users
CREATE POLICY users_admin_insert ON users
  FOR INSERT
  WITH CHECK (is_admin());

-- Users can update themselves, admins can update anyone
CREATE POLICY users_update ON users
  FOR UPDATE
  USING (auth.uid() = id OR is_admin());

-- Only admins can delete users
CREATE POLICY users_admin_delete ON users
  FOR DELETE
  USING (is_admin());

-- =====================================================
-- CUSTOMERS TABLE POLICIES
-- =====================================================

-- All authenticated users can view customers
CREATE POLICY customers_select_all ON customers
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Support+ can create customers
CREATE POLICY customers_insert ON customers
  FOR INSERT
  WITH CHECK (has_min_role('support'));

-- Support+ can update customers
CREATE POLICY customers_update ON customers
  FOR UPDATE
  USING (has_min_role('support'));

-- Manager+ can delete customers
CREATE POLICY customers_delete ON customers
  FOR DELETE
  USING (has_min_role('manager'));

-- =====================================================
-- CONTACTS TABLE POLICIES
-- =====================================================

-- All authenticated users can view contacts
CREATE POLICY contacts_select_all ON contacts
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Support+ can manage contacts
CREATE POLICY contacts_insert ON contacts
  FOR INSERT
  WITH CHECK (has_min_role('support'));

CREATE POLICY contacts_update ON contacts
  FOR UPDATE
  USING (has_min_role('support'));

CREATE POLICY contacts_delete ON contacts
  FOR DELETE
  USING (has_min_role('manager'));

-- =====================================================
-- SHIPMENTS TABLE POLICIES
-- =====================================================

-- All authenticated users can view shipments
CREATE POLICY shipments_select_all ON shipments
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Support+ can create shipments
CREATE POLICY shipments_insert ON shipments
  FOR INSERT
  WITH CHECK (has_min_role('support'));

-- Validator+ can update shipments
CREATE POLICY shipments_update ON shipments
  FOR UPDATE
  USING (has_min_role('validator'));

-- Manager+ can delete shipments
CREATE POLICY shipments_delete ON shipments
  FOR DELETE
  USING (has_min_role('manager'));

-- =====================================================
-- COMMUNICATION THREADS POLICIES
-- =====================================================

-- All authenticated users can view threads
CREATE POLICY threads_select_all ON communication_threads
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Support+ can create threads
CREATE POLICY threads_insert ON communication_threads
  FOR INSERT
  WITH CHECK (has_min_role('support'));

-- Support+ can update threads (close, assign status changes)
CREATE POLICY threads_update ON communication_threads
  FOR UPDATE
  USING (has_min_role('support'));

-- Manager+ can delete (archive) threads
CREATE POLICY threads_delete ON communication_threads
  FOR DELETE
  USING (has_min_role('manager'));

-- =====================================================
-- COMMUNICATION MESSAGES POLICIES
-- =====================================================

-- All authenticated users can view messages
CREATE POLICY messages_select_all ON communication_messages
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Support+ can send messages
CREATE POLICY messages_insert ON communication_messages
  FOR INSERT
  WITH CHECK (has_min_role('support'));

-- Support+ can update messages
CREATE POLICY messages_update ON communication_messages
  FOR UPDATE
  USING (has_min_role('support'));

-- Manager+ can delete messages
CREATE POLICY messages_delete ON communication_messages
  FOR DELETE
  USING (has_min_role('manager'));

-- =====================================================
-- COMMUNICATION ACTIONS POLICIES
-- =====================================================

-- All authenticated users can view actions
CREATE POLICY actions_select_all ON communication_actions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Support+ can create actions
CREATE POLICY actions_insert ON communication_actions
  FOR INSERT
  WITH CHECK (has_min_role('support'));

-- Assigned user or higher roles can update actions
CREATE POLICY actions_update ON communication_actions
  FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR has_min_role('validator')
  );

-- Manager+ can delete actions
CREATE POLICY actions_delete ON communication_actions
  FOR DELETE
  USING (has_min_role('manager'));

-- =====================================================
-- WORKFLOW DEFINITIONS POLICIES
-- =====================================================

-- All authenticated users can view workflows
CREATE POLICY workflow_defs_select_all ON workflow_definitions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Manager+ can create workflows
CREATE POLICY workflow_defs_insert ON workflow_definitions
  FOR INSERT
  WITH CHECK (has_min_role('manager'));

-- Manager+ can update workflows
CREATE POLICY workflow_defs_update ON workflow_definitions
  FOR UPDATE
  USING (has_min_role('manager'));

-- Manager+ can delete workflows
CREATE POLICY workflow_defs_delete ON workflow_definitions
  FOR DELETE
  USING (has_min_role('manager'));

-- =====================================================
-- WORKFLOW INSTANCES POLICIES
-- =====================================================

-- All authenticated users can view workflow instances
CREATE POLICY workflow_instances_select_all ON workflow_instances
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Support+ can create workflow instances
CREATE POLICY workflow_instances_insert ON workflow_instances
  FOR INSERT
  WITH CHECK (has_min_role('support'));

-- Support+ can update workflow instances
CREATE POLICY workflow_instances_update ON workflow_instances
  FOR UPDATE
  USING (has_min_role('support'));

-- Manager+ can delete workflow instances
CREATE POLICY workflow_instances_delete ON workflow_instances
  FOR DELETE
  USING (has_min_role('manager'));

-- =====================================================
-- WORKFLOW STEP EXECUTIONS POLICIES
-- =====================================================

-- All authenticated users can view step executions
CREATE POLICY step_executions_select_all ON workflow_step_executions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Support+ can create/update step executions
CREATE POLICY step_executions_insert ON workflow_step_executions
  FOR INSERT
  WITH CHECK (has_min_role('support'));

CREATE POLICY step_executions_update ON workflow_step_executions
  FOR UPDATE
  USING (has_min_role('support'));

-- =====================================================
-- EMAIL DRAFTS POLICIES
-- =====================================================

-- Users can only see their own drafts
CREATE POLICY drafts_select_own ON email_drafts
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can create their own drafts
CREATE POLICY drafts_insert_own ON email_drafts
  FOR INSERT
  WITH CHECK (user_id = auth.uid() AND has_min_role('support'));

-- Users can update their own drafts
CREATE POLICY drafts_update_own ON email_drafts
  FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own drafts
CREATE POLICY drafts_delete_own ON email_drafts
  FOR DELETE
  USING (user_id = auth.uid());

-- =====================================================
-- NOTIFICATIONS POLICIES
-- =====================================================

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
-- SERVICE ROLE BYPASS
-- =====================================================
-- Note: The service role (used by backend) bypasses RLS by default
-- This allows the backend to perform operations on behalf of users

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION has_min_role(user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
