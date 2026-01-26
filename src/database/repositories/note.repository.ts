import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';

export interface Note {
  id: string;
  thread_id: string;
  created_by: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateNoteRequest {
  thread_id: string;
  content: string;
  is_pinned?: boolean;
}

class NoteRepository {
  /**
   * Check if table exists (for graceful degradation)
   */
  private isTableMissingError(error: any): boolean {
    return (
      error.code === '42P01' ||
      (error.message?.includes('communication_notes') && error.message?.includes('not found')) ||
      error.message?.includes('schema cache')
    );
  }

  /**
   * Find all notes for a thread
   */
  async findByThreadId(threadId: string): Promise<Note[]> {
    const { data, error } = await supabaseAdmin
      .from('communication_notes')
      .select('*, creator:users!created_by(id, name, email)')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false });

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Notes table not found - returning empty array');
        return [];
      }
      logger.error('Error fetching notes', { error: error.message, threadId });
      throw error;
    }

    return data as Note[];
  }

  /**
   * Find note by ID
   */
  async findById(id: string): Promise<Note | null> {
    const { data, error } = await supabaseAdmin
      .from('communication_notes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found

      if (this.isTableMissingError(error)) {
        logger.debug('Notes table not found - returning null');
        return null;
      }

      logger.error('Error fetching note', { error: error.message, id });
      throw error;
    }

    return data as Note;
  }

  /**
   * Create new note
   */
  async create(noteData: CreateNoteRequest, userId: string): Promise<Note> {
    const { data, error } = await supabaseAdmin
      .from('communication_notes')
      .insert({
        ...noteData,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating note', { error: error.message });
      throw error;
    }

    logger.info('Note created', { id: data.id, threadId: noteData.thread_id });
    return data as Note;
  }

  /**
   * Update note
   */
  async update(id: string, updates: Partial<CreateNoteRequest>): Promise<Note> {
    const { data, error } = await supabaseAdmin
      .from('communication_notes')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating note', { error: error.message, id });
      throw error;
    }

    logger.info('Note updated', { id });
    return data as Note;
  }

  /**
   * Delete note
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from('communication_notes').delete().eq('id', id);

    if (error) {
      logger.error('Error deleting note', { error: error.message, id });
      throw error;
    }

    logger.info('Note deleted', { id });
  }

  /**
   * Toggle pin status
   */
  async togglePin(id: string): Promise<Note> {
    const note = await this.findById(id);
    if (!note) {
      throw new Error('Note not found');
    }

    return this.update(id, { is_pinned: !note.is_pinned });
  }
}

export default new NoteRepository();
