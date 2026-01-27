import shipmentRepository, {
  Shipment,
  ShipmentStage,
  CreateShipmentRequest,
  UpdateShipmentRequest,
  ShipmentFilters,
  PaginationParams,
} from '../database/repositories/shipment.repository';
import quotationRepository from '../database/repositories/quotation.repository';
import { logger } from '../utils/logger';

// ============================================================================
// Custom Error Classes
// ============================================================================

export class ShipmentError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ShipmentError';
  }
}

export class ShipmentNotFoundError extends ShipmentError {
  constructor(identifier: string) {
    super(`Shipment not found: ${identifier}`, 404);
    this.name = 'ShipmentNotFoundError';
  }
}

// ============================================================================
// Service Class
// ============================================================================

export class ShipmentService {
  /**
   * Shipment stage progression order
   */
  private readonly STAGE_ORDER: ShipmentStage[] = [
    'QUOTE_REQUEST',
    'QUOTATION',
    'BOOKING',
    'DOCUMENTATION',
    'CUSTOMS_CLEARANCE',
    'CARGO_COLLECTION',
    'IN_TRANSIT',
    'PORT_ARRIVAL',
    'CUSTOMS_DELIVERY',
    'FINAL_DELIVERY',
    'POD_COLLECTION',
    'BILLING',
    'CLOSURE',
  ];

  /**
   * Get all shipments with filters
   */
  async getShipments(filters: ShipmentFilters = {}, pagination: PaginationParams = {}) {
    try {
      return await shipmentRepository.findAll(filters, pagination);
    } catch (error: any) {
      logger.error('Failed to get shipments', { error: error.message });
      throw new ShipmentError(`Failed to retrieve shipments: ${error.message}`, 500);
    }
  }

  /**
   * Get shipment by ID
   */
  async getShipmentById(id: string): Promise<Shipment> {
    try {
      const shipment = await shipmentRepository.findById(id);

      if (!shipment) {
        throw new ShipmentNotFoundError(id);
      }

      return shipment;
    } catch (error: any) {
      if (error instanceof ShipmentNotFoundError) throw error;

      logger.error('Failed to get shipment by ID', { id, error: error.message });
      throw new ShipmentError(`Failed to retrieve shipment: ${error.message}`, 500);
    }
  }

  /**
   * Get shipment by reference
   */
  async getShipmentByReference(reference: string): Promise<Shipment> {
    try {
      const shipment = await shipmentRepository.findByReference(reference);

      if (!shipment) {
        throw new ShipmentNotFoundError(reference);
      }

      return shipment;
    } catch (error: any) {
      if (error instanceof ShipmentNotFoundError) throw error;

      logger.error('Failed to get shipment by reference', { reference, error: error.message });
      throw new ShipmentError(`Failed to retrieve shipment: ${error.message}`, 500);
    }
  }

  /**
   * Create shipment (optionally from quotation)
   */
  async createShipment(data: CreateShipmentRequest): Promise<Shipment> {
    try {
      // Validation
      this.validateShipmentData(data);

      // If creating from quotation, verify it exists and is accepted
      if (data.quotation_id) {
        const quotation = await quotationRepository.findById(data.quotation_id);

        if (!quotation) {
          throw new ShipmentError('Quotation not found');
        }

        if (quotation.status !== 'ACCEPTED') {
          throw new ShipmentError('Can only create shipment from accepted quotation');
        }

        // Auto-populate customer from quotation if not provided
        if (!data.customer_id) {
          data.customer_id = quotation.customer_id;
        }

        // Mark quotation as converted
        await quotationRepository.updateStatus(data.quotation_id, 'CONVERTED');
      }

      const shipment = await shipmentRepository.create(data);

      logger.info('Shipment created', {
        id: shipment.id,
        reference: shipment.reference,
        quotation_id: data.quotation_id,
      });

      return shipment;
    } catch (error: any) {
      if (error instanceof ShipmentError) throw error;

      logger.error('Failed to create shipment', { error: error.message });
      throw new ShipmentError(`Failed to create shipment: ${error.message}`, 500);
    }
  }

  /**
   * Update shipment
   */
  async updateShipment(id: string, updates: UpdateShipmentRequest): Promise<Shipment> {
    try {
      // Verify shipment exists
      await this.getShipmentById(id);

      const shipment = await shipmentRepository.update(id, updates);

      logger.info('Shipment updated', { id, current_stage: shipment.current_stage });

      return shipment;
    } catch (error: any) {
      if (error instanceof ShipmentError) throw error;

      logger.error('Failed to update shipment', { id, error: error.message });
      throw new ShipmentError(`Failed to update shipment: ${error.message}`, 500);
    }
  }

  /**
   * Update shipment stage (automatically tracked in history)
   */
  async updateShipmentStage(
    id: string,
    newStage: ShipmentStage,
    userId?: string
  ): Promise<Shipment> {
    try {
      const shipment = await this.getShipmentById(id);

      // Validate stage progression
      this.validateStageProgression(shipment.current_stage, newStage);

      const updatedShipment = await shipmentRepository.updateStage(id, newStage, userId);

      logger.info('Shipment stage updated', {
        id,
        reference: shipment.reference,
        from: shipment.current_stage,
        to: newStage,
      });

      // TODO: Trigger workflow based on stage (notifications, documents, etc.)

      return updatedShipment;
    } catch (error: any) {
      if (error instanceof ShipmentError) throw error;

      logger.error('Failed to update shipment stage', { id, newStage, error: error.message });
      throw new ShipmentError(`Failed to update shipment stage: ${error.message}`, 500);
    }
  }

  /**
   * Get shipment stage history
   */
  async getStageHistory(shipmentId: string) {
    try {
      return await shipmentRepository.getStageHistory(shipmentId);
    } catch (error: any) {
      logger.error('Failed to get stage history', { shipmentId, error: error.message });
      throw new ShipmentError(`Failed to retrieve stage history: ${error.message}`, 500);
    }
  }

  /**
   * Get shipments by current stage
   */
  async getShipmentsByStage(stage: ShipmentStage): Promise<Shipment[]> {
    try {
      return await shipmentRepository.findByStage(stage);
    } catch (error: any) {
      logger.error('Failed to get shipments by stage', { stage, error: error.message });
      throw new ShipmentError(`Failed to retrieve shipments: ${error.message}`, 500);
    }
  }

  /**
   * Get stage analytics
   */
  async getStageAnalytics() {
    try {
      return await shipmentRepository.getStageAnalytics();
    } catch (error: any) {
      logger.error('Failed to get stage analytics', { error: error.message });
      throw new ShipmentError(`Failed to retrieve analytics: ${error.message}`, 500);
    }
  }

  /**
   * Delete shipment
   */
  async deleteShipment(id: string): Promise<void> {
    try {
      await this.getShipmentById(id);
      await shipmentRepository.delete(id);

      logger.info('Shipment deleted', { id });
    } catch (error: any) {
      if (error instanceof ShipmentError) throw error;

      logger.error('Failed to delete shipment', { id, error: error.message });
      throw new ShipmentError(`Failed to delete shipment: ${error.message}`, 500);
    }
  }

  // ============================================================================
  // Validation Methods
  // ============================================================================

  /**
   * Validate shipment data
   */
  private validateShipmentData(data: CreateShipmentRequest): void {
    if (!data.shipment_type) {
      throw new ShipmentError('Shipment type is required');
    }

    if (!data.service_type) {
      throw new ShipmentError('Service type is required');
    }
  }

  /**
   * Validate stage progression (allow forward and backward movement)
   */
  private validateStageProgression(currentStage: ShipmentStage, newStage: ShipmentStage): void {
    // Allow any stage transition for flexibility
    // (Business logic may require certain stages in order, but system allows manual override)

    // Log warning if moving backward
    const currentIndex = this.STAGE_ORDER.indexOf(currentStage);
    const newIndex = this.STAGE_ORDER.indexOf(newStage);

    if (newIndex < currentIndex) {
      logger.warn('Shipment stage moving backward', {
        from: currentStage,
        to: newStage,
        message: 'This is allowed but unusual - verify this is intentional',
      });
    }
  }
}

export default new ShipmentService();
