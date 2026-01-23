import { Server as SocketIOServer, Socket } from 'socket.io';
import { supabase } from '../config/database.config';
import { logger } from '../utils/logger';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

export function initializeWebSocket(io: SocketIOServer): void {
  logger.info('Initializing WebSocket server...');

  // Connection event
  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info('Client connected', { socketId: socket.id });

    // Authenticate event
    socket.on('authenticate', async ({ token }: { token: string }) => {
      try {
        // Verify token with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
          socket.emit('error', { message: 'Authentication failed' });
          socket.disconnect();
          return;
        }

        // Attach user info to socket
        socket.userId = user.id;
        socket.userEmail = user.email;

        // Join user-specific room
        socket.join(`user:${user.id}`);

        socket.emit('authenticated', { userId: user.id, email: user.email });
        logger.info('Client authenticated', { socketId: socket.id, userId: user.id });

        // Update user presence
        await updateUserPresence(user.id, 'online');
      } catch (error) {
        logger.error('Authentication error', { error, socketId: socket.id });
        socket.emit('error', { message: 'Authentication failed' });
        socket.disconnect();
      }
    });

    // Thread operations
    socket.on('thread:join', ({ threadId }: { threadId: string }) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      socket.join(`thread:${threadId}`);
      logger.info('User joined thread', { userId: socket.userId, threadId });

      // Notify other users in the thread
      socket.to(`thread:${threadId}`).emit('thread:viewer_joined', {
        threadId,
        userId: socket.userId,
      });

      // Send current viewers
      const room = io.sockets.adapter.rooms.get(`thread:${threadId}`);
      const viewers = room ? Array.from(room) : [];
      socket.emit('thread:viewers', { threadId, viewers });
    });

    socket.on('thread:leave', ({ threadId }: { threadId: string }) => {
      if (!socket.userId) {
        return;
      }

      socket.leave(`thread:${threadId}`);
      logger.info('User left thread', { userId: socket.userId, threadId });

      // Notify other users
      socket.to(`thread:${threadId}`).emit('thread:viewer_left', {
        threadId,
        userId: socket.userId,
      });
    });

    // Typing indicator
    socket.on('thread:typing', ({ threadId, isTyping }: { threadId: string; isTyping: boolean }) => {
      if (!socket.userId) {
        return;
      }

      socket.to(`thread:${threadId}`).emit('thread:typing', {
        threadId,
        userId: socket.userId,
        isTyping,
      });
    });

    // Presence update
    socket.on('presence:update', async ({ status }: { status: 'online' | 'away' | 'busy' }) => {
      if (!socket.userId) {
        return;
      }

      await updateUserPresence(socket.userId, status);

      // Broadcast to all users
      io.emit('user:presence', {
        userId: socket.userId,
        status,
      });
    });

    // Disconnect event
    socket.on('disconnect', async () => {
      logger.info('Client disconnected', { socketId: socket.id, userId: socket.userId });

      if (socket.userId) {
        await updateUserPresence(socket.userId, 'offline');

        // Notify all users
        io.emit('user:presence', {
          userId: socket.userId,
          status: 'offline',
          lastSeen: new Date().toISOString(),
        });
      }
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error('Socket error', { error, socketId: socket.id, userId: socket.userId });
    });
  });

  logger.info('WebSocket server initialized');
}

async function updateUserPresence(userId: string, status: string): Promise<void> {
  try {
    await supabase
      .from('users')
      .update({
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', userId);
  } catch (error) {
    logger.error('Error updating user presence', { error, userId, status });
  }
}

export default initializeWebSocket;
