import rateCardRepository from '../database/repositories/rate-card.repository';
import shipperRepository from '../database/repositories/shipper.repository';
import shipperQuoteRequestRepository from '../database/repositories/shipper-quote-request.repository';
import { supabaseAdmin } from '../config/database.config';
import { logger } from '../utils/logger';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface RateCardPerformance {
  rate_card_id: string;
  rate_card_number: string;
  shipper_name: string;
  origin_airport: string;
  destination_airport: string;
  total_quotations: number;
  accepted_quotations: number;
  acceptance_rate: number;
  average_cost: number;
  total_revenue: number;
  last_used: string | null;
}

export interface ShipperPerformance {
  shipper_id: string;
  shipper_name: string;
  shipper_type: string;
  total_rate_cards: number;
  active_rate_cards: number;
  expiring_soon_count: number;
  total_quote_requests: number;
  pending_requests: number;
  received_requests: number;
  average_response_time_hours: number | null;
  total_quotations: number;
  acceptance_rate: number;
}

export interface QuoteAnalytics {
  total_quotations: number;
  by_source_mode: {
    inventory: number;
    on_demand: number;
  };
  by_status: {
    draft: number;
    sent: number;
    accepted: number;
    rejected: number;
    expired: number;
    converted: number;
  };
  acceptance_rate: number;
  average_quote_value: number;
  total_revenue: number;
}

export interface CostComparison {
  route: string;
  inventory_mode: {
    count: number;
    average_cost: number;
    lowest_cost: number;
    highest_cost: number;
  } | null;
  on_demand_mode: {
    count: number;
    average_cost: number;
    lowest_cost: number;
    highest_cost: number;
    average_response_time_hours: number;
  } | null;
  cost_difference: number | null;
  preferred_mode: 'INVENTORY' | 'ON_DEMAND' | 'EQUAL' | null;
}

export interface MarginAnalysis {
  overall: {
    total_quotations: number;
    average_margin_percentage: number;
    average_margin_amount: number;
    total_margin_revenue: number;
  };
  by_source_mode: {
    inventory: {
      count: number;
      average_margin_percentage: number;
      average_margin_amount: number;
      total_margin_revenue: number;
    };
    on_demand: {
      count: number;
      average_margin_percentage: number;
      average_margin_amount: number;
      total_margin_revenue: number;
    };
  };
  by_shipper: Array<{
    shipper_id: string;
    shipper_name: string;
    quotations_count: number;
    average_margin_percentage: number;
    total_margin_revenue: number;
  }>;
}

export interface ExpiringRateCard {
  id: string;
  rate_card_number: string;
  shipper_name: string;
  origin_airport: string;
  destination_airport: string;
  valid_until: string;
  days_until_expiry: number;
  is_used_recently: boolean;
  last_used_date: string | null;
}

export interface RouteProfitability {
  route: string;
  origin: string;
  destination: string;
  total_quotations: number;
  accepted_quotations: number;
  acceptance_rate: number;
  total_revenue: number;
  average_margin_percentage: number;
  total_margin_revenue: number;
  profitability_score: number;
}

// ============================================================================
// Analytics Service Class
// ============================================================================

export class AnalyticsService {
  /**
   * Get rate card performance metrics
   */
  async getRateCardPerformance(
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<RateCardPerformance[]> {
    try {
      // Query to get rate card usage with quotations
      const query = `
        SELECT
          rc.id as rate_card_id,
          rc.rate_card_number,
          s.shipper_name,
          rc.origin_airport,
          rc.destination_airport,
          COUNT(q.id) as total_quotations,
          COUNT(CASE WHEN q.status = 'ACCEPTED' THEN 1 END) as accepted_quotations,
          COALESCE(
            ROUND(
              COUNT(CASE WHEN q.status = 'ACCEPTED' THEN 1 END)::numeric /
              NULLIF(COUNT(q.id), 0) * 100,
              2
            ),
            0
          ) as acceptance_rate,
          COALESCE(ROUND(AVG(q.total_cost), 2), 0) as average_cost,
          COALESCE(SUM(CASE WHEN q.status = 'ACCEPTED' THEN q.total_cost ELSE 0 END), 0) as total_revenue,
          MAX(q.created_at) as last_used
        FROM rate_cards rc
        INNER JOIN shippers s ON rc.shipper_id = s.id
        LEFT JOIN quotations q ON q.rate_card_id = rc.id
          ${dateFrom ? `AND q.created_at >= '${dateFrom.toISOString()}'` : ''}
          ${dateTo ? `AND q.created_at <= '${dateTo.toISOString()}'` : ''}
        WHERE rc.is_active = true
        GROUP BY rc.id, rc.rate_card_number, s.shipper_name, rc.origin_airport, rc.destination_airport
        ORDER BY total_quotations DESC, acceptance_rate DESC
      `;

      const { data, error } = await supabaseAdmin.rpc('exec_sql', { sql: query });

      if (error) {
        logger.error('Error fetching rate card performance', { error: error.message });
        return [];
      }

      return data as RateCardPerformance[];
    } catch (error: any) {
      logger.error('Error in getRateCardPerformance', { error: error.message });
      return [];
    }
  }

  /**
   * Get shipper performance metrics
   */
  async getShipperPerformance(): Promise<ShipperPerformance[]> {
    try {
      const shippers = await shipperRepository.findAll({ is_active: true });
      const allRateCards = await rateCardRepository.findAll();
      const rateCards = allRateCards.filter((rc) => rc.status === 'ACTIVE');
      const quoteRequests = await shipperQuoteRequestRepository.findAll();

      const performance: ShipperPerformance[] = [];

      for (const shipper of shippers) {
        const shipperRateCards = rateCards.filter((rc) => rc.shipper_id === shipper.id);
        const expiringSoon = shipperRateCards.filter((rc) => {
          const validUntil = new Date(rc.valid_until);
          const daysUntilExpiry = Math.ceil(
            (validUntil.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          );
          return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
        });

        const shipperQuoteRequests = quoteRequests.filter(
          (qr) => qr.shipper_id === shipper.id
        );
        const pendingRequests = shipperQuoteRequests.filter(
          (qr) => qr.status === 'PENDING' || qr.status === 'SENT'
        );
        const receivedRequests = shipperQuoteRequests.filter(
          (qr) => qr.status === 'RECEIVED'
        );

        // Calculate average response time
        const respondedRequests = shipperQuoteRequests.filter(
          (qr) => qr.responded_at && qr.requested_at
        );
        let avgResponseTime = null;
        if (respondedRequests.length > 0) {
          const totalHours = respondedRequests.reduce((sum, qr) => {
            const requested = new Date(qr.requested_at);
            const responded = new Date(qr.responded_at!);
            const hours = (responded.getTime() - requested.getTime()) / (1000 * 60 * 60);
            return sum + hours;
          }, 0);
          avgResponseTime = Math.round(totalHours / respondedRequests.length);
        }

        // Get quotations for this shipper (would need quotations query)
        // For now, using placeholder values
        const totalQuotations = 0; // TODO: Query quotations table
        const acceptedQuotations = 0; // TODO: Query quotations table
        const acceptanceRate = totalQuotations > 0 ? (acceptedQuotations / totalQuotations) * 100 : 0;

        performance.push({
          shipper_id: shipper.id,
          shipper_name: shipper.shipper_name,
          shipper_type: shipper.shipper_type,
          total_rate_cards: shipperRateCards.length,
          active_rate_cards: shipperRateCards.filter((rc) => {
            const validUntil = new Date(rc.valid_until);
            return validUntil > new Date();
          }).length,
          expiring_soon_count: expiringSoon.length,
          total_quote_requests: shipperQuoteRequests.length,
          pending_requests: pendingRequests.length,
          received_requests: receivedRequests.length,
          average_response_time_hours: avgResponseTime,
          total_quotations: totalQuotations,
          acceptance_rate: acceptanceRate,
        });
      }

      // Sort by total activity (rate cards + quote requests)
      return performance.sort(
        (a, b) =>
          b.total_rate_cards +
          b.total_quote_requests -
          (a.total_rate_cards + a.total_quote_requests)
      );
    } catch (error: any) {
      logger.error('Error in getShipperPerformance', { error: error.message });
      return [];
    }
  }

  /**
   * Get quote analytics
   */
  async getQuoteAnalytics(dateFrom?: Date, dateTo?: Date): Promise<QuoteAnalytics> {
    try {
      let query = supabaseAdmin.from('quotations').select('*');

      if (dateFrom) {
        query = query.gte('created_at', dateFrom.toISOString());
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo.toISOString());
      }

      const { data: quotations, error } = await query;

      if (error) {
        logger.error('Error fetching quotations for analytics', { error: error.message });
        return this.getEmptyQuoteAnalytics();
      }

      if (!quotations || quotations.length === 0) {
        return this.getEmptyQuoteAnalytics();
      }

      const inventoryCount = quotations.filter((q) => q.quote_source_mode === 'INVENTORY').length;
      const onDemandCount = quotations.filter((q) => q.quote_source_mode === 'ON_DEMAND').length;

      const byStatus = {
        draft: quotations.filter((q) => q.status === 'DRAFT').length,
        sent: quotations.filter((q) => q.status === 'SENT').length,
        accepted: quotations.filter((q) => q.status === 'ACCEPTED').length,
        rejected: quotations.filter((q) => q.status === 'REJECTED').length,
        expired: quotations.filter((q) => q.status === 'EXPIRED').length,
        converted: quotations.filter((q) => q.status === 'CONVERTED').length,
      };

      const totalSent = byStatus.sent + byStatus.accepted + byStatus.rejected + byStatus.expired;
      const acceptanceRate = totalSent > 0 ? (byStatus.accepted / totalSent) * 100 : 0;

      const totalCost = quotations.reduce((sum, q) => sum + (q.total_cost || 0), 0);
      const averageQuoteValue = quotations.length > 0 ? totalCost / quotations.length : 0;

      const acceptedQuotations = quotations.filter((q) => q.status === 'ACCEPTED');
      const totalRevenue = acceptedQuotations.reduce((sum, q) => sum + (q.total_cost || 0), 0);

      return {
        total_quotations: quotations.length,
        by_source_mode: {
          inventory: inventoryCount,
          on_demand: onDemandCount,
        },
        by_status: byStatus,
        acceptance_rate: Math.round(acceptanceRate * 100) / 100,
        average_quote_value: Math.round(averageQuoteValue * 100) / 100,
        total_revenue: Math.round(totalRevenue * 100) / 100,
      };
    } catch (error: any) {
      logger.error('Error in getQuoteAnalytics', { error: error.message });
      return this.getEmptyQuoteAnalytics();
    }
  }

  private getEmptyQuoteAnalytics(): QuoteAnalytics {
    return {
      total_quotations: 0,
      by_source_mode: { inventory: 0, on_demand: 0 },
      by_status: { draft: 0, sent: 0, accepted: 0, rejected: 0, expired: 0, converted: 0 },
      acceptance_rate: 0,
      average_quote_value: 0,
      total_revenue: 0,
    };
  }

  /**
   * Get expiring rate cards (within next 30 days)
   */
  async getExpiringRateCards(daysThreshold: number = 30): Promise<ExpiringRateCard[]> {
    try {
      const allRateCards = await rateCardRepository.findAll();
      const rateCards = allRateCards.filter((rc) => rc.status === 'ACTIVE');
      const now = new Date();
      const thresholdDate = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);

      const expiring: ExpiringRateCard[] = [];

      for (const rc of rateCards) {
        const validUntil = new Date(rc.valid_until);
        const daysUntilExpiry = Math.ceil((validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry <= daysThreshold && daysUntilExpiry > 0) {
          // Check if used recently (last 30 days)
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          const { data: recentUsage } = await supabaseAdmin
            .from('quotations')
            .select('created_at')
            .eq('rate_card_id', rc.id)
            .gte('created_at', thirtyDaysAgo.toISOString())
            .order('created_at', { ascending: false })
            .limit(1);

          const lastUsedDate = recentUsage && recentUsage.length > 0 ? recentUsage[0].created_at : null;

          expiring.push({
            id: rc.id,
            rate_card_number: rc.rate_card_number,
            shipper_name: rc.shipper_name || 'Unknown',
            origin_airport: rc.origin_airport,
            destination_airport: rc.destination_airport,
            valid_until: rc.valid_until,
            days_until_expiry: daysUntilExpiry,
            is_used_recently: !!lastUsedDate,
            last_used_date: lastUsedDate,
          });
        }
      }

      // Sort by days until expiry (most urgent first)
      return expiring.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
    } catch (error: any) {
      logger.error('Error in getExpiringRateCards', { error: error.message });
      return [];
    }
  }

  /**
   * Get margin analysis
   */
  async getMarginAnalysis(dateFrom?: Date, dateTo?: Date): Promise<MarginAnalysis> {
    try {
      let query = supabaseAdmin.from('quotations').select('*');

      if (dateFrom) {
        query = query.gte('created_at', dateFrom.toISOString());
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo.toISOString());
      }

      const { data: quotations, error } = await query;

      if (error || !quotations || quotations.length === 0) {
        return this.getEmptyMarginAnalysis();
      }

      // Filter quotations with margin data
      const withMargin = quotations.filter((q) => q.margin_amount !== null && q.margin_amount !== undefined);

      if (withMargin.length === 0) {
        return this.getEmptyMarginAnalysis();
      }

      const totalMarginRevenue = withMargin.reduce((sum, q) => sum + (q.margin_amount || 0), 0);
      const avgMarginPercentage = withMargin.reduce((sum, q) => sum + (q.margin_percentage || 0), 0) / withMargin.length;
      const avgMarginAmount = totalMarginRevenue / withMargin.length;

      // By source mode
      const inventoryQuotes = withMargin.filter((q) => q.quote_source_mode === 'INVENTORY');
      const onDemandQuotes = withMargin.filter((q) => q.quote_source_mode === 'ON_DEMAND');

      const inventoryMarginRevenue = inventoryQuotes.reduce((sum, q) => sum + (q.margin_amount || 0), 0);
      const onDemandMarginRevenue = onDemandQuotes.reduce((sum, q) => sum + (q.margin_amount || 0), 0);

      // By shipper (for on-demand quotes with shipper_quote_request_id)
      const byShipperMap = new Map<string, { shipper_name: string; quotations: any[] }>();

      for (const quote of onDemandQuotes) {
        if (quote.shipper_quote_request_id) {
          const sqr = await shipperQuoteRequestRepository.findById(quote.shipper_quote_request_id);
          if (sqr) {
            const key = sqr.shipper_id;
            if (!byShipperMap.has(key)) {
              byShipperMap.set(key, { shipper_name: sqr.shipper_name || 'Unknown', quotations: [] });
            }
            byShipperMap.get(key)!.quotations.push(quote);
          }
        }
      }

      const byShipper = Array.from(byShipperMap.entries()).map(([shipper_id, data]) => {
        const marginRevenue = data.quotations.reduce((sum, q) => sum + (q.margin_amount || 0), 0);
        const avgMargin = data.quotations.reduce((sum, q) => sum + (q.margin_percentage || 0), 0) / data.quotations.length;

        return {
          shipper_id,
          shipper_name: data.shipper_name,
          quotations_count: data.quotations.length,
          average_margin_percentage: Math.round(avgMargin * 100) / 100,
          total_margin_revenue: Math.round(marginRevenue * 100) / 100,
        };
      });

      return {
        overall: {
          total_quotations: withMargin.length,
          average_margin_percentage: Math.round(avgMarginPercentage * 100) / 100,
          average_margin_amount: Math.round(avgMarginAmount * 100) / 100,
          total_margin_revenue: Math.round(totalMarginRevenue * 100) / 100,
        },
        by_source_mode: {
          inventory: {
            count: inventoryQuotes.length,
            average_margin_percentage: inventoryQuotes.length > 0
              ? Math.round((inventoryQuotes.reduce((sum, q) => sum + (q.margin_percentage || 0), 0) / inventoryQuotes.length) * 100) / 100
              : 0,
            average_margin_amount: inventoryQuotes.length > 0
              ? Math.round((inventoryMarginRevenue / inventoryQuotes.length) * 100) / 100
              : 0,
            total_margin_revenue: Math.round(inventoryMarginRevenue * 100) / 100,
          },
          on_demand: {
            count: onDemandQuotes.length,
            average_margin_percentage: onDemandQuotes.length > 0
              ? Math.round((onDemandQuotes.reduce((sum, q) => sum + (q.margin_percentage || 0), 0) / onDemandQuotes.length) * 100) / 100
              : 0,
            average_margin_amount: onDemandQuotes.length > 0
              ? Math.round((onDemandMarginRevenue / onDemandQuotes.length) * 100) / 100
              : 0,
            total_margin_revenue: Math.round(onDemandMarginRevenue * 100) / 100,
          },
        },
        by_shipper: byShipper.sort((a, b) => b.total_margin_revenue - a.total_margin_revenue),
      };
    } catch (error: any) {
      logger.error('Error in getMarginAnalysis', { error: error.message });
      return this.getEmptyMarginAnalysis();
    }
  }

  private getEmptyMarginAnalysis(): MarginAnalysis {
    return {
      overall: {
        total_quotations: 0,
        average_margin_percentage: 0,
        average_margin_amount: 0,
        total_margin_revenue: 0,
      },
      by_source_mode: {
        inventory: {
          count: 0,
          average_margin_percentage: 0,
          average_margin_amount: 0,
          total_margin_revenue: 0,
        },
        on_demand: {
          count: 0,
          average_margin_percentage: 0,
          average_margin_amount: 0,
          total_margin_revenue: 0,
        },
      },
      by_shipper: [],
    };
  }
}

export default new AnalyticsService();
