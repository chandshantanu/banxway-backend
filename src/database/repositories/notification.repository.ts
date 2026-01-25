import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'HIGH_PRIORITY'
  | 'SLA_WARNING'
  | 'SLA_BREACH'
  | 'CLIENT_APPROVED'
  | 'CLIENT_REJECTED'
  | 'AGENT_ERROR'
  | 'HANDOFF_REQUEST';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  request_id: string | null;
  thread_id: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateNotificationRequest {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  request_id?: string;
  thread_id?: string;
  action_url?: string;
}

class NotificationRepository {
  /**
   * Check if notifications table exists (for graceful degradation)
   */
  private isTableMissingError(error: any): boolean {
    return (
      error.code === '42P01' ||
      (error.message?.includes('notifications') && error.message?.includes('not found')) ||
      error.message?.includes('schema cache')
    );
  }

  /**
   * Find all notifications for a user
   */
  async findByUserId(
    userId: string,
    options: { includeRead?: boolean; limit?: number } = {}
  ): Promise<Notification[]> {
    const { includeRead = false, limit = 50 } = options;

    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeRead) {
      query = query.is('read_at', null);
    }

    const { data, error } = await query;

    if (error) {
      // Graceful degradation: return empty array if table doesn't exist
      if (this.isTableMissingError(error)) {
        logger.debug('Notifications table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching notifications', { userId, error: error.message });
      throw error;
    }

    return data as Notification[];
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) {
      // Graceful degradation: return 0 if table doesn't exist
      if (this.isTableMissingError(error)) {
        logger.debug('Notifications table not found - returning 0');
        return 0;
      }

      logger.error('Error counting unread notifications', { userId, error: error.message });
      throw error;
    }

    return count || 0;
  }

  /**
   * Find notification by ID
   */
  async findById(id: string): Promise<Notification | null> {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found

      // Graceful degradation: return null if table doesn't exist
      if (this.isTableMissingError(error)) {
        logger.debug('Notifications table not found - returning null');
        return null;
      }

      logger.error('Error fetching notification', { id, error: error.message });
      throw error;
    }

    return data as Notification;
  }

  /**
   * Create a new notification
   */
  async create(data: CreateNotificationRequest): Promise<Notification> {
    const notificationData = {
      user_id: data.user_id,
      type: data.type,
      title: data.title,
      message: data.message,
      request_id: data.request_id || null,
      thread_id: data.thread_id || null,
      action_url: data.action_url || null,
    };

    const { data: result, error } = await supabaseAdmin
      .from('notifications')
      .insert(notificationData)
      .select()
      .single();

    if (error) {
      logger.error('Error creating notification', {
        data: notificationData,
        error: error.message,
      });
      throw error;
    }

    logger.info('Notification created', {
      id: result.id,
      userId: result.user_id,
      type: result.type,
    });

    return result as Notification;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: string): Promise<Notification> {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error marking notification as read', { id, error: error.message });
      throw error;
    }

    logger.info('Notification marked as read', { id });
    return data as Notification;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null)
      .select();

    if (error) {
      logger.error('Error marking all notifications as read', {
        userId,
        error: error.message,
      });
      throw error;
    }

    const count = data?.length || 0;
    logger.info('All notifications marked as read', { userId, count });

    return count;
  }

  /**
   * Delete a notification
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting notification', { id, error: error.message });
      throw error;
    }

    logger.info('Notification deleted', { id });
  }

  /**
   * Delete old read notifications (cleanup)
   */
  async deleteOldRead(userId: string, olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .not('read_at', 'is', null)
      .lt('read_at', cutoffDate.toISOString())
      .select();

    if (error) {
      logger.error('Error deleting old notifications', {
        userId,
        olderThanDays,
        error: error.message,
      });
      throw error;
    }

    const count = data?.length || 0;
    logger.info('Old notifications deleted', { userId, count });

    return count;
  }
}

export default new NotificationRepository();
