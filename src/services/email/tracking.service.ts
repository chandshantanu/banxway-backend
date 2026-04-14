import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';
import crypto from 'crypto';

// 1x1 transparent PNG pixel (68 bytes)
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

export interface TrackingEvent {
  id: string;
  message_id: string;
  event_type: 'OPEN' | 'CLICK' | 'UNSUBSCRIBE';
  ip_address: string | null;
  user_agent: string | null;
  geo_city: string | null;
  geo_country: string | null;
  geo_region: string | null;
  link_url: string | null;
  created_at: string;
}

class EmailTrackingService {
  /**
   * Generate a tracking ID for a message (deterministic, URL-safe)
   */
  generateTrackingId(messageId: string): string {
    return crypto.createHash('sha256').update(messageId).digest('hex').substring(0, 24);
  }

  /**
   * Reverse lookup: find message ID from tracking ID
   * Stores mapping in the message metadata
   */
  async getMessageIdFromTrackingId(trackingId: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from('communication_messages')
      .select('id')
      .contains('metadata', { tracking_id: trackingId })
      .limit(1)
      .single();

    if (error || !data) return null;
    return data.id;
  }

  /**
   * Inject tracking pixel and wrap links in outgoing HTML email
   */
  injectTracking(
    html: string,
    messageId: string,
    baseUrl: string
  ): string {
    const trackingId = this.generateTrackingId(messageId);
    let tracked = html;

    // Wrap <a href="..."> links for click tracking
    let linkIndex = 0;
    tracked = tracked.replace(
      /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
      (match: string, pre: string, url: string, post: string) => {
        // Skip mailto, tel, and anchor links
        if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
          return match;
        }
        // Skip tracking/unsubscribe URLs (avoid double-wrapping)
        if (url.includes('/tracking/')) return match;

        const idx = linkIndex++;
        const trackUrl = `${baseUrl}/api/v1/tracking/click/${trackingId}/${idx}?url=${encodeURIComponent(url)}`;
        return `<a ${pre}href="${trackUrl}"${post}>`;
      }
    );

    // Add tracking pixel before </body> or at end
    const pixelHtml = `<img src="${baseUrl}/api/v1/tracking/open/${trackingId}" width="1" height="1" style="display:none;border:0;" alt="" />`;

    if (tracked.includes('</body>')) {
      tracked = tracked.replace('</body>', `${pixelHtml}</body>`);
    } else {
      tracked += pixelHtml;
    }

    // Add unsubscribe link in footer
    const unsubUrl = `${baseUrl}/api/v1/tracking/unsubscribe/${trackingId}`;
    const disclaimer = `<div style="margin-top:20px;padding-top:10px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">This email may contain tracking for analytics. <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a></div>`;

    if (tracked.includes('</body>')) {
      tracked = tracked.replace('</body>', `${disclaimer}</body>`);
    } else {
      tracked += disclaimer;
    }

    return tracked;
  }

  /**
   * Get the List-Unsubscribe header value for an email
   */
  getUnsubscribeHeader(messageId: string, baseUrl: string): string {
    const trackingId = this.generateTrackingId(messageId);
    return `<${baseUrl}/api/v1/tracking/unsubscribe/${trackingId}>`;
  }

  /**
   * Record a tracking event
   */
  async recordEvent(
    trackingId: string,
    eventType: 'OPEN' | 'CLICK' | 'UNSUBSCRIBE',
    ip: string | null,
    userAgent: string | null,
    linkUrl?: string
  ): Promise<void> {
    // Resolve message ID from tracking ID
    const messageId = await this.getMessageIdFromTrackingId(trackingId);
    if (!messageId) {
      logger.warn('Tracking event for unknown tracking ID', { trackingId, eventType });
      return;
    }

    // GeoIP lookup (using free geoip-lite if available)
    let geo = { city: null as string | null, country: null as string | null, region: null as string | null };
    if (ip) {
      try {
        const geoip = require('geoip-lite');
        const lookup = geoip.lookup(ip);
        if (lookup) {
          geo.city = lookup.city || null;
          geo.country = lookup.country || null;
          geo.region = lookup.region || null;
        }
      } catch {
        // geoip-lite not installed — skip geo lookup
      }
    }

    const { error } = await supabaseAdmin
      .from('email_tracking_events')
      .insert({
        message_id: messageId,
        event_type: eventType,
        ip_address: ip,
        user_agent: userAgent,
        geo_city: geo.city,
        geo_country: geo.country,
        geo_region: geo.region,
        link_url: linkUrl || null,
      });

    if (error) {
      logger.error('Failed to record tracking event', { trackingId, eventType, error: error.message });
    } else {
      logger.info('Tracking event recorded', { trackingId, eventType, messageId, geo });
    }
  }

  /**
   * Get tracking stats for a message
   */
  async getMessageStats(messageId: string): Promise<{
    opens: number;
    uniqueOpens: number;
    clicks: number;
    locations: Array<{ city: string | null; country: string | null; count: number }>;
    lastOpenedAt: string | null;
    events: TrackingEvent[];
  }> {
    const { data, error } = await supabaseAdmin
      .from('email_tracking_events')
      .select('*')
      .eq('message_id', messageId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return { opens: 0, uniqueOpens: 0, clicks: 0, locations: [], lastOpenedAt: null, events: [] };
    }

    const events = data as TrackingEvent[];
    const opens = events.filter((e: TrackingEvent) => e.event_type === 'OPEN');
    const clicks = events.filter((e: TrackingEvent) => e.event_type === 'CLICK');
    const uniqueIps = new Set(opens.map((e: TrackingEvent) => e.ip_address).filter(Boolean));

    // Aggregate locations
    const locationMap = new Map<string, number>();
    opens.forEach((e: TrackingEvent) => {
      const key = `${e.geo_city || 'Unknown'}|${e.geo_country || 'Unknown'}`;
      locationMap.set(key, (locationMap.get(key) || 0) + 1);
    });
    const locations = Array.from(locationMap.entries()).map(([key, count]) => {
      const [city, country] = key.split('|');
      return { city, country, count };
    });

    return {
      opens: opens.length,
      uniqueOpens: uniqueIps.size,
      clicks: clicks.length,
      locations,
      lastOpenedAt: opens.length > 0 ? opens[0].created_at : null,
      events,
    };
  }

  /**
   * Return the 1x1 transparent tracking pixel
   */
  getTrackingPixel(): Buffer {
    return TRACKING_PIXEL;
  }
}

export default new EmailTrackingService();
