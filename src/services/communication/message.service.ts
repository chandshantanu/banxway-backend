import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';
import { io } from '../../index';

export interface CreateMessageInput {
  thread_id: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'VOICE' | 'PORTAL';
  direction: 'INBOUND' | 'OUTBOUND';
  content: string;
  subject?: string;
  from_address: string;
  to_addresses: Array<{ address: string }>;
  cc_addresses?: Array<{ address: string }>;
  bcc_addresses?: Array<{ address: string }>;
  external_id?: string;
  status?: string;
  attachments?: any[];
  sent_by?: string;
  metadata?: any;
  transcription_status?: string;
}

export interface UpdateMessageInput {
  content?: string;
  status?: string;
  delivered_at?: Date;
  read_at?: Date;
  transcription_status?: string;
  transcription_language?: string;
  transcription_confidence?: number;
  metadata?: any;
}

export class MessageService {
  /**
   * Create a new message
   */
  async createMessage(input: CreateMessageInput): Promise<any> {
    try {
      const { data: message, error } = await supabaseAdmin
        .from('communication_messages')
        .insert({
          ...input,
          sent_at: new Date(),
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      // Update thread timestamps
      await this.updateThreadTimestamps(input.thread_id);

      // Emit WebSocket event
      io.to(`thread:${input.thread_id}`).emit('thread:message', {
        threadId: input.thread_id,
        message,
      });

      logger.info('Message created', {
        messageId: message.id,
        threadId: input.thread_id,
        channel: input.channel,
        direction: input.direction,
      });

      return message;
    } catch (error: any) {
      logger.error('Failed to create message', {
        error: error.message,
        input,
      });
      throw error;
    }
  }

  /**
   * Get messages for a thread
   */
  async getThreadMessages(
    threadId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ messages: any[]; total: number }> {
    try {
      const { data: messages, error, count } = await supabaseAdmin
        .from('communication_messages')
        .select('*', { count: 'exact' })
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new Error(error.message);
      }

      return {
        messages: messages || [],
        total: count || 0,
      };
    } catch (error: any) {
      logger.error('Failed to get thread messages', {
        error: error.message,
        threadId,
      });
      throw error;
    }
  }

  /**
   * Get a single message by ID
   */
  async getMessage(messageId: string): Promise<any> {
    try {
      const { data: message, error } = await supabaseAdmin
        .from('communication_messages')
        .select('*')
        .eq('id', messageId)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return message;
    } catch (error: any) {
      logger.error('Failed to get message', {
        error: error.message,
        messageId,
      });
      throw error;
    }
  }

  /**
   * Update a message
   */
  async updateMessage(
    messageId: string,
    updates: UpdateMessageInput
  ): Promise<any> {
    try {
      const { data: message, error } = await supabaseAdmin
        .from('communication_messages')
        .update(updates)
        .eq('id', messageId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      logger.info('Message updated', {
        messageId,
        updates,
      });

      return message;
    } catch (error: any) {
      logger.error('Failed to update message', {
        error: error.message,
        messageId,
        updates,
      });
      throw error;
    }
  }

  /**
   * Delete a message (soft delete)
   */
  async deleteMessage(messageId: string): Promise<any> {
    try {
      const { data: message, error } = await supabaseAdmin
        .from('communication_messages')
        .update({ deleted_at: new Date() })
        .eq('id', messageId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      logger.info('Message deleted', {
        messageId,
      });

      return message;
    } catch (error: any) {
      logger.error('Failed to delete message', {
        error: error.message,
        messageId,
      });
      throw error;
    }
  }

  /**
   * Update message status by external ID
   */
  async updateMessageByExternalId(
    externalId: string,
    updates: UpdateMessageInput
  ): Promise<any> {
    try {
      const { data: message, error } = await supabaseAdmin
        .from('communication_messages')
        .update(updates)
        .eq('external_id', externalId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      logger.info('Message updated by external ID', {
        externalId,
        updates,
      });

      return message;
    } catch (error: any) {
      logger.error('Failed to update message by external ID', {
        error: error.message,
        externalId,
        updates,
      });
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string): Promise<any> {
    return this.updateMessage(messageId, {
      read_at: new Date(),
      status: 'READ',
    });
  }

  /**
   * Mark message as delivered
   */
  async markAsDelivered(messageId: string): Promise<any> {
    return this.updateMessage(messageId, {
      delivered_at: new Date(),
      status: 'DELIVERED',
    });
  }

  /**
   * Get messages by channel
   */
  async getMessagesByChannel(
    threadId: string,
    channel: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      const { data: messages, error } = await supabaseAdmin
        .from('communication_messages')
        .select('*')
        .eq('thread_id', threadId)
        .eq('channel', channel)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message);
      }

      return messages || [];
    } catch (error: any) {
      logger.error('Failed to get messages by channel', {
        error: error.message,
        threadId,
        channel,
      });
      throw error;
    }
  }

  /**
   * Get unread messages count
   */
  async getUnreadCount(threadId: string): Promise<number> {
    try {
      const { count, error } = await supabaseAdmin
        .from('communication_messages')
        .select('*', { count: 'exact', head: true })
        .eq('thread_id', threadId)
        .eq('direction', 'INBOUND')
        .is('read_at', null)
        .is('deleted_at', null);

      if (error) {
        throw new Error(error.message);
      }

      return count || 0;
    } catch (error: any) {
      logger.error('Failed to get unread count', {
        error: error.message,
        threadId,
      });
      throw error;
    }
  }

  /**
   * Update thread timestamps
   */
  private async updateThreadTimestamps(threadId: string): Promise<void> {
    try {
      await supabaseAdmin
        .from('communication_threads')
        .update({
          last_activity_at: new Date(),
          last_message_at: new Date(),
        })
        .eq('id', threadId);
    } catch (error: any) {
      logger.error('Failed to update thread timestamps', {
        error: error.message,
        threadId,
      });
      // Don't throw error, just log it
    }
  }

  /**
   * Search messages
   */
  async searchMessages(
    threadId: string,
    query: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      const { data: messages, error } = await supabaseAdmin
        .from('communication_messages')
        .select('*')
        .eq('thread_id', threadId)
        .ilike('content', `%${query}%`)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message);
      }

      return messages || [];
    } catch (error: any) {
      logger.error('Failed to search messages', {
        error: error.message,
        threadId,
        query,
      });
      throw error;
    }
  }

  /**
   * Get message statistics for a thread
   */
  async getThreadStatistics(threadId: string): Promise<any> {
    try {
      const { data: stats, error } = await supabaseAdmin.rpc('get_thread_message_stats', {
        thread_id_param: threadId,
      });

      if (error) {
        // If RPC doesn't exist, calculate manually
        const { data: messages } = await supabaseAdmin
          .from('communication_messages')
          .select('channel, direction, status')
          .eq('thread_id', threadId)
          .is('deleted_at', null);

        if (!messages) return null;

        const stats = {
          total: messages.length,
          byChannel: {} as any,
          byDirection: {} as any,
          byStatus: {} as any,
        };

        messages.forEach((msg: any) => {
          stats.byChannel[msg.channel] = (stats.byChannel[msg.channel] || 0) + 1;
          stats.byDirection[msg.direction] = (stats.byDirection[msg.direction] || 0) + 1;
          stats.byStatus[msg.status] = (stats.byStatus[msg.status] || 0) + 1;
        });

        return stats;
      }

      return stats;
    } catch (error: any) {
      logger.error('Failed to get thread statistics', {
        error: error.message,
        threadId,
      });
      throw error;
    }
  }
}

export default new MessageService();
