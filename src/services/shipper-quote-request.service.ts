import shipperQuoteRequestRepository, {
  ShipperQuoteRequest,
  ShipperQuoteRequestWithShipper,
  CreateShipperQuoteRequestRequest,
  UpdateShipperQuoteRequestRequest,
  ShipperQuoteRequestFilters,
  QuoteRequestStatus,
} from '../database/repositories/shipper-quote-request.repository';
import quotationRepository, { Quotation } from '../database/repositories/quotation.repository';
import { logger } from '../utils/logger';

// ============================================================================
// Custom Error Classes
// ============================================================================

export class ShipperQuoteRequestError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ShipperQuoteRequestError';
  }
}

export class ShipperQuoteRequestNotFoundError extends ShipperQuoteRequestError {
  constructor(identifier: string) {
    super(`Shipper quote request not found: ${identifier}`, 404);
    this.name = 'ShipperQuoteRequestNotFoundError';
  }
}

// ============================================================================
// Service Interfaces
// ============================================================================

export interface ConvertToQuotationRequest {
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  valid_days?: number;
  notes?: string;
  internal_notes?: string;
}

export interface ConvertToQuotationResult {
  quotation: Quotation;
  shipper_quote_request: ShipperQuoteRequestWithShipper;
  cost_breakdown: {
    shipper_quote_amount: number;
    margin_percentage: number;
    margin_amount: number;
    total_cost: number;
    currency: string;
  };
}

// ============================================================================
// Service Class
// ============================================================================

export class ShipperQuoteRequestService {
  /**
   * Get all shipper quote requests with filters
   */
  async getShipperQuoteRequests(
    filters: ShipperQuoteRequestFilters = {}
  ): Promise<ShipperQuoteRequestWithShipper[]> {
    try {
      return await shipperQuoteRequestRepository.findAll(filters);
    } catch (error: any) {
      logger.error('Failed to get shipper quote requests', { error: error.message });
      throw new ShipperQuoteRequestError(
        `Failed to retrieve shipper quote requests: ${error.message}`,
        500
      );
    }
  }

  /**
   * Get shipper quote request by ID
   */
  async getShipperQuoteRequestById(id: string): Promise<ShipperQuoteRequestWithShipper> {
    try {
      const request = await shipperQuoteRequestRepository.findById(id);

      if (!request) {
        throw new ShipperQuoteRequestNotFoundError(id);
      }

      return request;
    } catch (error: any) {
      if (error instanceof ShipperQuoteRequestNotFoundError) throw error;

      logger.error('Failed to get shipper quote request by ID', { id, error: error.message });
      throw new ShipperQuoteRequestError(
        `Failed to retrieve shipper quote request: ${error.message}`,
        500
      );
    }
  }

  /**
   * Get shipper quote requests for a quotation
   */
  async getShipperQuoteRequestsByQuotation(
    quotationId: string
  ): Promise<ShipperQuoteRequestWithShipper[]> {
    try {
      return await shipperQuoteRequestRepository.findByQuotationId(quotationId);
    } catch (error: any) {
      logger.error('Failed to get shipper quote requests by quotation', {
        quotationId,
        error: error.message,
      });
      throw new ShipperQuoteRequestError(
        `Failed to retrieve shipper quote requests: ${error.message}`,
        500
      );
    }
  }

  /**
   * Create new shipper quote request
   */
  async createShipperQuoteRequest(
    data: CreateShipperQuoteRequestRequest,
    userId?: string
  ): Promise<ShipperQuoteRequestWithShipper> {
    try {
      // Validation
      this.validateShipperQuoteRequestData(data);

      // Add user context
      const requestData = {
        ...data,
        requested_by: userId,
      };

      const request = await shipperQuoteRequestRepository.create(requestData);

      logger.info('Shipper quote request created', {
        id: request.id,
        request_number: request.request_number,
        shipper_id: request.shipper_id,
      });

      return request;
    } catch (error: any) {
      if (error instanceof ShipperQuoteRequestError) throw error;

      logger.error('Failed to create shipper quote request', { error: error.message });
      throw new ShipperQuoteRequestError(
        `Failed to create shipper quote request: ${error.message}`,
        500
      );
    }
  }

  /**
   * Update shipper quote request
   */
  async updateShipperQuoteRequest(
    id: string,
    updates: UpdateShipperQuoteRequestRequest
  ): Promise<ShipperQuoteRequestWithShipper> {
    try {
      // Verify request exists
      await this.getShipperQuoteRequestById(id);

      // If updating status to RECEIVED, set responded_at
      if (updates.status === 'RECEIVED' && !updates.responded_at) {
        updates.responded_at = new Date().toISOString();
      }

      const request = await shipperQuoteRequestRepository.update(id, updates);

      logger.info('Shipper quote request updated', { id, status: request.status });

      return request;
    } catch (error: any) {
      if (error instanceof ShipperQuoteRequestError) throw error;

      logger.error('Failed to update shipper quote request', { id, error: error.message });
      throw new ShipperQuoteRequestError(
        `Failed to update shipper quote request: ${error.message}`,
        500
      );
    }
  }

  /**
   * Update shipper quote request status
   */
  async updateShipperQuoteRequestStatus(
    id: string,
    status: QuoteRequestStatus
  ): Promise<ShipperQuoteRequestWithShipper> {
    try {
      const updates: UpdateShipperQuoteRequestRequest = { status };

      // Set responded_at when status changes to RECEIVED
      if (status === 'RECEIVED') {
        updates.responded_at = new Date().toISOString();
      }

      return await this.updateShipperQuoteRequest(id, updates);
    } catch (error: any) {
      if (error instanceof ShipperQuoteRequestError) throw error;

      logger.error('Failed to update shipper quote request status', {
        id,
        status,
        error: error.message,
      });
      throw new ShipperQuoteRequestError(
        `Failed to update shipper quote request status: ${error.message}`,
        500
      );
    }
  }

  /**
   * Record shipper response
   */
  async recordShipperResponse(
    id: string,
    response: {
      shipper_quote_amount: number;
      shipper_quote_currency?: string;
      shipper_quote_validity?: string;
      shipper_quote_file_url?: string;
      shipper_response_details?: any;
    }
  ): Promise<ShipperQuoteRequestWithShipper> {
    try {
      const updates: UpdateShipperQuoteRequestRequest = {
        ...response,
        status: 'RECEIVED',
        responded_at: new Date().toISOString(),
      };

      const request = await this.updateShipperQuoteRequest(id, updates);

      logger.info('Shipper response recorded', {
        id,
        shipper_quote_amount: response.shipper_quote_amount,
      });

      return request;
    } catch (error: any) {
      if (error instanceof ShipperQuoteRequestError) throw error;

      logger.error('Failed to record shipper response', { id, error: error.message });
      throw new ShipperQuoteRequestError(
        `Failed to record shipper response: ${error.message}`,
        500
      );
    }
  }

  /**
   * Convert shipper quote request to customer quotation (Phase 5 - On-Demand Mode)
   */
  async convertToQuotation(
    requestId: string,
    data: ConvertToQuotationRequest,
    userId?: string
  ): Promise<ConvertToQuotationResult> {
    try {
      // Get shipper quote request
      const request = await this.getShipperQuoteRequestById(requestId);

      // Validate request status
      if (request.status !== 'RECEIVED') {
        throw new ShipperQuoteRequestError(
          'Can only convert requests with RECEIVED status',
          400
        );
      }

      if (!request.shipper_quote_amount) {
        throw new ShipperQuoteRequestError('Shipper quote amount is required', 400);
      }

      // Calculate margin
      const shipperAmount = request.shipper_quote_amount;
      const marginPercentage = request.margin_percentage || 15.0;
      const marginFlatFee = request.margin_flat_fee || 0;
      const marginAmount = (shipperAmount * marginPercentage) / 100 + marginFlatFee;
      const totalCost = shipperAmount + marginAmount;

      // Calculate validity dates
      const validFrom = new Date().toISOString().split('T')[0];
      const validDays = data.valid_days || 7;
      const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      // Create cost breakdown
      const costBreakdown = {
        shipper_quote_amount: shipperAmount,
        margin_percentage: marginPercentage,
        margin_amount: marginAmount,
        total_cost: totalCost,
        currency: request.shipper_quote_currency,
        quote_request: {
          request_number: request.request_number,
          shipper_name: request.shipper_name,
        },
      };

      // Create quotation
      const quotation = await quotationRepository.create({
        customer_id: data.customer_id,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        customer_phone: data.customer_phone,
        shipment_type: request.shipment_type as any,
        origin_location: request.origin_location,
        origin_country: request.origin_country,
        destination_location: request.destination_location,
        destination_country: request.destination_country,
        cargo_description: request.commodity_type,
        cargo_weight_kg: request.gross_weight_kg,
        cargo_volume_cbm: request.cargo_volume_cbm,
        cargo_dimensions: request.dimensions,
        total_cost: totalCost,
        currency: request.shipper_quote_currency,
        cost_breakdown: costBreakdown,
        valid_from: validFrom,
        valid_until: validUntil,
        notes: data.notes,
        internal_notes: data.internal_notes,
        created_by: userId,
      });

      // Update quotation with on-demand mode details
      await quotationRepository.update(quotation.id, {
        // @ts-ignore - These fields exist in database but not in interface yet
        quote_source_mode: 'ON_DEMAND',
        shipper_quote_request_id: requestId,
        shipper_cost: shipperAmount,
        margin_percentage: marginPercentage,
        margin_amount: marginAmount,
      });

      // Update shipper quote request with quotation link
      await shipperQuoteRequestRepository.update(requestId, {
        quotation_id: quotation.id,
      } as any);

      // Fetch updated quotation
      const finalQuotation = await quotationRepository.findById(quotation.id);

      logger.info('Shipper quote request converted to quotation', {
        request_id: requestId,
        quotation_id: quotation.id,
        quote_number: quotation.quote_number,
        total_cost: totalCost,
      });

      return {
        quotation: finalQuotation!,
        shipper_quote_request: request,
        cost_breakdown: {
          shipper_quote_amount: shipperAmount,
          margin_percentage: marginPercentage,
          margin_amount: marginAmount,
          total_cost: totalCost,
          currency: request.shipper_quote_currency,
        },
      };
    } catch (error: any) {
      if (error instanceof ShipperQuoteRequestError) throw error;

      logger.error('Failed to convert shipper quote request to quotation', {
        requestId,
        error: error.message,
      });
      throw new ShipperQuoteRequestError(
        `Failed to convert to quotation: ${error.message}`,
        500
      );
    }
  }

  /**
   * Delete shipper quote request
   */
  async deleteShipperQuoteRequest(id: string): Promise<void> {
    try {
      // Verify request exists
      await this.getShipperQuoteRequestById(id);

      await shipperQuoteRequestRepository.delete(id);

      logger.info('Shipper quote request deleted', { id });
    } catch (error: any) {
      if (error instanceof ShipperQuoteRequestError) throw error;

      logger.error('Failed to delete shipper quote request', { id, error: error.message });
      throw new ShipperQuoteRequestError(
        `Failed to delete shipper quote request: ${error.message}`,
        500
      );
    }
  }

  /**
   * Get pending quote requests
   */
  async getPendingQuoteRequests(): Promise<ShipperQuoteRequestWithShipper[]> {
    try {
      return await shipperQuoteRequestRepository.findPending();
    } catch (error: any) {
      logger.error('Failed to get pending quote requests', { error: error.message });
      throw new ShipperQuoteRequestError(
        `Failed to retrieve pending quote requests: ${error.message}`,
        500
      );
    }
  }

  /**
   * Get received quote requests (ready to convert)
   */
  async getReceivedQuoteRequests(): Promise<ShipperQuoteRequestWithShipper[]> {
    try {
      return await shipperQuoteRequestRepository.findReceived();
    } catch (error: any) {
      logger.error('Failed to get received quote requests', { error: error.message });
      throw new ShipperQuoteRequestError(
        `Failed to retrieve received quote requests: ${error.message}`,
        500
      );
    }
  }

  // ============================================================================
  // Validation Methods
  // ============================================================================

  /**
   * Validate shipper quote request data
   */
  private validateShipperQuoteRequestData(data: CreateShipperQuoteRequestRequest): void {
    if (!data.shipper_id) {
      throw new ShipperQuoteRequestError('Shipper ID is required');
    }

    if (!data.shipment_type) {
      throw new ShipperQuoteRequestError('Shipment type is required');
    }

    if (!data.origin_location) {
      throw new ShipperQuoteRequestError('Origin location is required');
    }

    if (!data.destination_location) {
      throw new ShipperQuoteRequestError('Destination location is required');
    }

    if (!data.gross_weight_kg || data.gross_weight_kg <= 0) {
      throw new ShipperQuoteRequestError('Valid gross weight is required');
    }
  }
}

export default new ShipperQuoteRequestService();
