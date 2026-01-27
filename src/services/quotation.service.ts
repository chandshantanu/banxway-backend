import quotationRepository, {
  Quotation,
  CreateQuotationRequest,
  UpdateQuotationRequest,
  QuotationFilters,
  PaginationParams,
} from '../database/repositories/quotation.repository';
import rateCardRepository, { RateCardWithShipper } from '../database/repositories/rate-card.repository';
import { logger } from '../utils/logger';

// ============================================================================
// Custom Error Classes
// ============================================================================

export class QuotationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'QuotationError';
  }
}

export class QuotationNotFoundError extends QuotationError {
  constructor(identifier: string) {
    super(`Quotation not found: ${identifier}`, 404);
    this.name = 'QuotationNotFoundError';
  }
}

export class InvalidStatusTransitionError extends QuotationError {
  constructor(from: string, to: string) {
    super(`Cannot transition quotation from ${from} to ${to}`, 400);
    this.name = 'InvalidStatusTransitionError';
  }
}

// ============================================================================
// Auto-Quotation Interfaces
// ============================================================================

export interface AutoQuotationRequest {
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  shipment_type: Quotation['shipment_type'];
  origin_location: string;
  origin_country?: string;
  destination_location: string;
  destination_country?: string;
  cargo_description?: string;
  cargo_weight_kg: number;
  cargo_volume_cbm?: number;
  cargo_dimensions?: any;
  service_requirements?: any;
  valid_days?: number; // Quote validity period (default: 7 days)
  notes?: string;
  internal_notes?: string;
}

export interface AutoQuotationResult {
  quotation: Quotation;
  rate_card: RateCardWithShipper;
  cost_calculation: {
    chargeable_weight: number;
    applicable_rate: number;
    freight_cost: number;
    surcharge_amount: number;
    handling_charges: number;
    shipper_cost: number;
    margin_percentage: number;
    margin_amount: number;
    total_cost: number;
    currency: string;
  };
}

// ============================================================================
// Service Class
// ============================================================================

export class QuotationService {
  /**
   * Valid status transitions
   */
  private readonly VALID_TRANSITIONS: Record<string, string[]> = {
    DRAFT: ['SENT', 'DRAFT'], // Can update draft or send
    SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'SENT'], // Can update while sent
    ACCEPTED: ['CONVERTED'], // Can only convert to shipment
    REJECTED: [], // Terminal state (but can delete/recreate)
    EXPIRED: [], // Terminal state
    CONVERTED: [], // Terminal state
  };

  /**
   * Get all quotations with filters and pagination
   */
  async getQuotations(filters: QuotationFilters = {}, pagination: PaginationParams = {}) {
    try {
      return await quotationRepository.findAll(filters, pagination);
    } catch (error: any) {
      logger.error('Failed to get quotations', { error: error.message });
      throw new QuotationError(`Failed to retrieve quotations: ${error.message}`, 500);
    }
  }

  /**
   * Get quotation by ID
   */
  async getQuotationById(id: string): Promise<Quotation> {
    try {
      const quotation = await quotationRepository.findById(id);

      if (!quotation) {
        throw new QuotationNotFoundError(id);
      }

      return quotation;
    } catch (error: any) {
      if (error instanceof QuotationNotFoundError) throw error;

      logger.error('Failed to get quotation by ID', { id, error: error.message });
      throw new QuotationError(`Failed to retrieve quotation: ${error.message}`, 500);
    }
  }

  /**
   * Get quotation by quote number
   */
  async getQuotationByNumber(quoteNumber: string): Promise<Quotation> {
    try {
      const quotation = await quotationRepository.findByQuoteNumber(quoteNumber);

      if (!quotation) {
        throw new QuotationNotFoundError(quoteNumber);
      }

      return quotation;
    } catch (error: any) {
      if (error instanceof QuotationNotFoundError) throw error;

      logger.error('Failed to get quotation by number', { quoteNumber, error: error.message });
      throw new QuotationError(`Failed to retrieve quotation: ${error.message}`, 500);
    }
  }

  /**
   * Get quotations for customer
   */
  async getCustomerQuotations(customerId: string): Promise<Quotation[]> {
    try {
      return await quotationRepository.findByCustomer(customerId);
    } catch (error: any) {
      logger.error('Failed to get customer quotations', { customerId, error: error.message });
      throw new QuotationError(`Failed to retrieve customer quotations: ${error.message}`, 500);
    }
  }

  /**
   * Create new quotation with validation
   */
  async createQuotation(data: CreateQuotationRequest, userId?: string): Promise<Quotation> {
    try {
      // Validation
      this.validateQuotationData(data);

      // Add user context
      const quotationData = {
        ...data,
        created_by: userId,
      };

      const quotation = await quotationRepository.create(quotationData);

      logger.info('Quotation created', {
        id: quotation.id,
        quote_number: quotation.quote_number,
        customer_name: quotation.customer_name,
      });

      return quotation;
    } catch (error: any) {
      if (error instanceof QuotationError) throw error;

      logger.error('Failed to create quotation', { error: error.message });
      throw new QuotationError(`Failed to create quotation: ${error.message}`, 500);
    }
  }

  /**
   * Update quotation
   */
  async updateQuotation(id: string, updates: UpdateQuotationRequest): Promise<Quotation> {
    try {
      // Verify quotation exists
      const existing = await this.getQuotationById(id);

      // Validate status transition if status is being updated
      if (updates.status && updates.status !== existing.status) {
        this.validateStatusTransition(existing.status, updates.status);
      }

      const quotation = await quotationRepository.update(id, updates);

      logger.info('Quotation updated', { id, status: quotation.status });

      return quotation;
    } catch (error: any) {
      if (error instanceof QuotationError) throw error;

      logger.error('Failed to update quotation', { id, error: error.message });
      throw new QuotationError(`Failed to update quotation: ${error.message}`, 500);
    }
  }

  /**
   * Update quotation status with validation
   */
  async updateQuotationStatus(
    id: string,
    newStatus: Quotation['status'],
    userId?: string
  ): Promise<Quotation> {
    try {
      // Verify quotation exists
      const existing = await this.getQuotationById(id);

      // Validate status transition
      this.validateStatusTransition(existing.status, newStatus);

      const quotation = await quotationRepository.updateStatus(id, newStatus, userId);

      logger.info('Quotation status updated', {
        id,
        from: existing.status,
        to: newStatus,
        userId,
      });

      return quotation;
    } catch (error: any) {
      if (error instanceof QuotationError) throw error;

      logger.error('Failed to update quotation status', { id, newStatus, error: error.message });
      throw new QuotationError(`Failed to update quotation status: ${error.message}`, 500);
    }
  }

  /**
   * Send quotation to customer
   */
  async sendQuotation(id: string, userId?: string): Promise<Quotation> {
    try {
      const quotation = await this.updateQuotationStatus(id, 'SENT', userId);

      // TODO: Trigger workflow to send email/WhatsApp notification to customer

      logger.info('Quotation sent to customer', {
        id,
        quote_number: quotation.quote_number,
        customer_email: quotation.customer_email,
      });

      return quotation;
    } catch (error: any) {
      if (error instanceof QuotationError) throw error;

      logger.error('Failed to send quotation', { id, error: error.message });
      throw new QuotationError(`Failed to send quotation: ${error.message}`, 500);
    }
  }

  /**
   * Accept quotation (customer accepted)
   */
  async acceptQuotation(id: string): Promise<Quotation> {
    try {
      const quotation = await this.updateQuotationStatus(id, 'ACCEPTED');

      // TODO: Trigger workflow for shipment booking

      logger.info('Quotation accepted', {
        id,
        quote_number: quotation.quote_number,
      });

      return quotation;
    } catch (error: any) {
      if (error instanceof QuotationError) throw error;

      logger.error('Failed to accept quotation', { id, error: error.message });
      throw new QuotationError(`Failed to accept quotation: ${error.message}`, 500);
    }
  }

  /**
   * Delete quotation
   */
  async deleteQuotation(id: string): Promise<void> {
    try {
      // Verify quotation exists
      await this.getQuotationById(id);

      await quotationRepository.delete(id);

      logger.info('Quotation deleted', { id });
    } catch (error: any) {
      if (error instanceof QuotationError) throw error;

      logger.error('Failed to delete quotation', { id, error: error.message });
      throw new QuotationError(`Failed to delete quotation: ${error.message}`, 500);
    }
  }

  /**
   * Get quotations expiring soon
   */
  async getExpiringSoonQuotations(days: number = 7): Promise<Quotation[]> {
    try {
      return await quotationRepository.findExpiringSoon(days);
    } catch (error: any) {
      logger.error('Failed to get expiring quotations', { days, error: error.message });
      throw new QuotationError(`Failed to retrieve expiring quotations: ${error.message}`, 500);
    }
  }

  // ============================================================================
  // Auto-Quotation Methods (Inventory Mode - Phase 4)
  // ============================================================================

  /**
   * Find matching rate cards for auto-quotation
   */
  async findMatchingRateCards(
    origin: string,
    destination: string,
    chargeableWeight: number,
    shipmentType: Quotation['shipment_type']
  ): Promise<RateCardWithShipper[]> {
    try {
      // Search for rate cards matching the route
      const rateCards = await rateCardRepository.findByRoute(origin, destination);

      // Filter by shipment type and weight constraints
      const matchingCards = rateCards.filter((card) => {
        // Check shipment type
        if (card.shipment_type !== shipmentType) return false;

        // Check weight constraints
        if (card.min_weight_kg && chargeableWeight < card.min_weight_kg) return false;
        if (card.max_weight_kg && chargeableWeight > card.max_weight_kg) return false;

        // Check if weight falls in any slab
        const hasApplicableSlab = card.weight_slabs.some(
          (slab) =>
            chargeableWeight >= slab.min_kg &&
            (slab.max_kg === Infinity || chargeableWeight <= slab.max_kg)
        );

        return hasApplicableSlab;
      });

      logger.info('Found matching rate cards', {
        origin,
        destination,
        chargeableWeight,
        shipmentType,
        matchCount: matchingCards.length,
      });

      return matchingCards;
    } catch (error: any) {
      logger.error('Failed to find matching rate cards', {
        origin,
        destination,
        error: error.message,
      });
      throw new QuotationError(`Failed to find matching rate cards: ${error.message}`, 500);
    }
  }

  /**
   * Auto-generate quotation from rate card (Inventory Mode)
   */
  async autoGenerateQuotation(
    data: AutoQuotationRequest,
    userId?: string
  ): Promise<AutoQuotationResult> {
    try {
      // Calculate chargeable weight
      let chargeableWeight = data.cargo_weight_kg;
      if (data.cargo_volume_cbm) {
        const volumetricWeight = data.cargo_volume_cbm * 167; // Standard air freight conversion
        chargeableWeight = Math.max(chargeableWeight, volumetricWeight);
      }

      logger.info('Auto-generating quotation', {
        customer_name: data.customer_name,
        origin: data.origin_location,
        destination: data.destination_location,
        chargeable_weight: chargeableWeight,
        shipment_type: data.shipment_type,
      });

      // Find matching rate cards
      const matchingRateCards = await this.findMatchingRateCards(
        data.origin_location,
        data.destination_location,
        chargeableWeight,
        data.shipment_type
      );

      if (matchingRateCards.length === 0) {
        throw new QuotationError(
          'No rate cards found for the specified route and weight. Please use on-demand quotation.',
          404
        );
      }

      // Select best rate card (highest margin percentage for max profit)
      const selectedRateCard = matchingRateCards.reduce((best, current) => {
        return (current.margin_percentage || 0) >= (best.margin_percentage || 0) ? current : best;
      });

      logger.info('Selected rate card', {
        rate_card_number: selectedRateCard.rate_card_number,
        shipper_name: selectedRateCard.shipper_name,
        margin_percentage: selectedRateCard.margin_percentage,
      });

      // Calculate costs using rate card
      const costCalculation = this.calculateCostFromRateCard(selectedRateCard, chargeableWeight);

      // Calculate validity dates
      const validFrom = new Date().toISOString().split('T')[0];
      const validDays = data.valid_days || 7;
      const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      // Create detailed cost breakdown
      const costBreakdown = {
        chargeable_weight: chargeableWeight,
        applicable_rate: costCalculation.applicable_rate,
        freight_cost: costCalculation.freight_cost,
        surcharges: {
          FSC: costCalculation.surcharge_breakdown.FSC || 0,
          SSC: costCalculation.surcharge_breakdown.SSC || 0,
          DG: costCalculation.surcharge_breakdown.DG || 0,
          total: costCalculation.surcharge_amount,
        },
        handling_charges: {
          origin: selectedRateCard.origin_handling_charges || 0,
          destination: selectedRateCard.destination_handling_charges || 0,
          total: costCalculation.handling_charges,
        },
        shipper_cost: costCalculation.shipper_cost,
        margin: {
          percentage: costCalculation.margin_percentage,
          amount: costCalculation.margin_amount,
        },
        total_cost: costCalculation.total_cost,
        currency: costCalculation.currency,
        rate_card: {
          number: selectedRateCard.rate_card_number,
          shipper: selectedRateCard.shipper_name,
        },
      };

      // Create quotation
      const quotation = await quotationRepository.create({
        customer_id: data.customer_id,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        customer_phone: data.customer_phone,
        shipment_type: data.shipment_type,
        origin_location: data.origin_location,
        origin_country: data.origin_country,
        destination_location: data.destination_location,
        destination_country: data.destination_country,
        cargo_description: data.cargo_description,
        cargo_weight_kg: data.cargo_weight_kg,
        cargo_volume_cbm: data.cargo_volume_cbm,
        cargo_dimensions: data.cargo_dimensions,
        service_requirements: data.service_requirements,
        total_cost: costCalculation.total_cost,
        currency: costCalculation.currency,
        cost_breakdown: costBreakdown,
        valid_from: validFrom,
        valid_until: validUntil,
        notes: data.notes,
        internal_notes: data.internal_notes,
        created_by: userId,
      });

      // Update quotation with rate card details (these fields exist in migration 012)
      await quotationRepository.update(quotation.id, {
        // @ts-ignore - These fields exist in database but not in interface yet
        quote_source_mode: 'INVENTORY',
        rate_card_id: selectedRateCard.id,
        shipper_cost: costCalculation.shipper_cost,
        margin_percentage: costCalculation.margin_percentage,
        // @ts-ignore
        margin_amount: costCalculation.margin_amount,
        chargeable_weight: chargeableWeight,
      });

      // Fetch updated quotation
      const finalQuotation = await quotationRepository.findById(quotation.id);

      logger.info('Auto-quotation generated successfully', {
        quotation_id: quotation.id,
        quote_number: quotation.quote_number,
        rate_card_id: selectedRateCard.id,
        total_cost: costCalculation.total_cost,
      });

      return {
        quotation: finalQuotation!,
        rate_card: selectedRateCard,
        cost_calculation: costCalculation,
      };
    } catch (error: any) {
      if (error instanceof QuotationError) throw error;

      logger.error('Failed to auto-generate quotation', { error: error.message });
      throw new QuotationError(`Failed to auto-generate quotation: ${error.message}`, 500);
    }
  }

  /**
   * Calculate cost from rate card
   */
  private calculateCostFromRateCard(
    rateCard: RateCardWithShipper,
    chargeableWeight: number
  ): {
    chargeable_weight: number;
    applicable_rate: number;
    freight_cost: number;
    surcharge_amount: number;
    surcharge_breakdown: { FSC?: number; SSC?: number; DG?: number };
    handling_charges: number;
    shipper_cost: number;
    margin_percentage: number;
    margin_amount: number;
    total_cost: number;
    currency: string;
  } {
    // Find applicable weight slab
    let applicableRate = 0;
    let currency = 'USD';

    for (const slab of rateCard.weight_slabs) {
      if (
        chargeableWeight >= slab.min_kg &&
        (slab.max_kg === Infinity || chargeableWeight <= slab.max_kg)
      ) {
        applicableRate = slab.rate_per_kg;
        currency = slab.currency || 'USD';
        break;
      }
    }

    if (applicableRate === 0) {
      throw new QuotationError('No applicable rate found for the given weight');
    }

    // Calculate freight cost
    const freightCost = chargeableWeight * applicableRate;

    // Calculate surcharges
    let surchargeAmount = 0;
    const surchargeBreakdown: { FSC?: number; SSC?: number; DG?: number } = {};

    if (rateCard.surcharges) {
      // Percentage surcharges (FSC, SSC)
      if (rateCard.surcharges.FSC) {
        const fscAmount = freightCost * rateCard.surcharges.FSC;
        surchargeAmount += fscAmount;
        surchargeBreakdown.FSC = fscAmount;
      }

      if (rateCard.surcharges.SSC) {
        const sscAmount = freightCost * rateCard.surcharges.SSC;
        surchargeAmount += sscAmount;
        surchargeBreakdown.SSC = sscAmount;
      }

      // Flat surcharges (DG)
      if (rateCard.surcharges.DG) {
        surchargeAmount += rateCard.surcharges.DG;
        surchargeBreakdown.DG = rateCard.surcharges.DG;
      }
    }

    // Calculate handling charges
    const handlingCharges =
      (rateCard.origin_handling_charges || 0) + (rateCard.destination_handling_charges || 0);

    // Calculate shipper cost (freight + surcharges + handling)
    const shipperCost = freightCost + surchargeAmount + handlingCharges;

    // Apply Banxway margin
    const marginPercentage = rateCard.margin_percentage || 15.0; // Default 15%
    const marginAmount = (shipperCost * marginPercentage) / 100;

    // Calculate total cost
    const totalCost = shipperCost + marginAmount;

    return {
      chargeable_weight: chargeableWeight,
      applicable_rate: applicableRate,
      freight_cost: freightCost,
      surcharge_amount: surchargeAmount,
      surcharge_breakdown: surchargeBreakdown,
      handling_charges: handlingCharges,
      shipper_cost: shipperCost,
      margin_percentage: marginPercentage,
      margin_amount: marginAmount,
      total_cost: Math.round(totalCost * 100) / 100, // Round to 2 decimals
      currency,
    };
  }

  // ============================================================================
  // Validation Methods
  // ============================================================================

  /**
   * Validate quotation data
   */
  private validateQuotationData(data: CreateQuotationRequest): void {
    if (!data.customer_name || data.customer_name.trim().length === 0) {
      throw new QuotationError('Customer name is required');
    }

    if (!data.shipment_type) {
      throw new QuotationError('Shipment type is required');
    }

    if (data.total_cost === undefined || data.total_cost < 0) {
      throw new QuotationError('Valid total cost is required');
    }

    if (!data.valid_from || !data.valid_until) {
      throw new QuotationError('Validity dates are required');
    }

    // Check validity dates
    const validFrom = new Date(data.valid_from);
    const validUntil = new Date(data.valid_until);

    if (validFrom >= validUntil) {
      throw new QuotationError('Valid until date must be after valid from date');
    }

    // Validate email if provided
    if (data.customer_email && !this.isValidEmail(data.customer_email)) {
      throw new QuotationError('Invalid customer email format');
    }
  }

  /**
   * Validate status transition
   */
  private validateStatusTransition(currentStatus: string, newStatus: string): void {
    const allowedTransitions = this.VALID_TRANSITIONS[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw new InvalidStatusTransitionError(currentStatus, newStatus);
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export default new QuotationService();
