import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { supabaseAdmin } from '../../../config/database.config';
import { asyncHandler } from '../../../middleware/error.middleware';

const router = Router();

/**
 * GET /api/v1/debug/email-counts
 * Debug endpoint to investigate email count inflation
 */
router.get('/email-counts', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Total messages
    const { count: totalMessages } = await supabaseAdmin
        .from('communication_messages')
        .select('*', { count: 'exact', head: true });

    // Messages with external_id
    const { data: messagesWithExtId, count: emailCount } = await supabaseAdmin
        .from('communication_messages')
        .select('external_id', { count: 'exact' })
        .not('external_id', 'is', null);

    // Count unique external_ids
    const uniqueExternalIds = new Set(messagesWithExtId?.map(m => m.external_id) || []);

    // Find duplicates
    const externalIdCounts: Record<string, number> = {};
    messagesWithExtId?.forEach(m => {
        if (m.external_id) {
            externalIdCounts[m.external_id] = (externalIdCounts[m.external_id] || 0) + 1;
        }
    });

    const duplicates = Object.entries(externalIdCounts)
        .filter(([_, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    // Thread count
    const { count: threadCount } = await supabaseAdmin
        .from('communication_threads')
        .select('*', { count: 'exact', head: true })
        .eq('archived', false);

    // Channel breakdown
    const { data: channelBreakdown } = await supabaseAdmin
        .from('communication_messages')
        .select('channel, direction');

    const breakdown: Record<string, Record<string, number>> = {};
    channelBreakdown?.forEach(m => {
        const channel = m.channel || 'UNKNOWN';
        const direction = m.direction || 'UNKNOWN';
        if (!breakdown[channel]) breakdown[channel] = {};
        breakdown[channel][direction] = (breakdown[channel][direction] || 0) + 1;
    });

    res.json({
        success: true,
        data: {
            total_messages: totalMessages,
            email_messages: emailCount,
            unique_emails: uniqueExternalIds.size,
            duplicates: emailCount! - uniqueExternalIds.size,
            active_threads: threadCount,
            top_duplicates: duplicates.map(([id, count]) => ({
                external_id: id.substring(0, 60) + '...',
                count
            })),
            channel_breakdown: breakdown,
        }
    });
}));

export default router;
