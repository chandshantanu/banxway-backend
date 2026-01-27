/**
 * Shipper Service
 *
 * Business logic for shipper management
 */

import shipperRepository, {
  type Shipper,
  type CreateShipperRequest,
  type UpdateShipperRequest,
  type ShipperFilters,
} from '../database/repositories/shipper.repository';
import { logger } from '../utils/logger';

class ShipperService {
  /**
   * Get all shippers with optional filters
   */
  async getShippers(filters?: ShipperFilters): Promise<Shipper[]> {
    try {
      return await shipperRepository.findAll(filters);
    } catch (error: any) {
      logger.error('Failed to get shippers', { error: error.message });
      throw new Error('Failed to retrieve shippers');
    }
  }

  /**
   * Get shipper by ID
   */
  async getShipperById(id: string): Promise<Shipper> {
    try {
      const shipper = await shipperRepository.findById(id);

      if (!shipper) {
        throw new Error('Shipper not found');
      }

      return shipper;
    } catch (error: any) {
      if (error.message === 'Shipper not found') {
        throw error;
      }

      logger.error('Failed to get shipper', { id, error: error.message });
      throw new Error('Failed to retrieve shipper');
    }
  }

  /**
   * Create new shipper
   */
  async createShipper(data: CreateShipperRequest): Promise<Shipper> {
    try {
      // Validation
      if (!data.shipper_code || data.shipper_code.trim().length === 0) {
        throw new Error('Shipper code is required');
      }

      if (!data.shipper_name || data.shipper_name.trim().length === 0) {
        throw new Error('Shipper name is required');
      }

      if (!data.shipper_type) {
        throw new Error('Shipper type is required');
      }

      // Check if code already exists
      const existing = await shipperRepository.findByCode(data.shipper_code);
      if (existing) {
        throw new Error(`Shipper code '${data.shipper_code}' already exists`);
      }

      // Validate email if provided
      if (data.contact_email && !this.isValidEmail(data.contact_email)) {
        throw new Error('Invalid email format');
      }

      return await shipperRepository.create(data);
    } catch (error: any) {
      if (
        error.message.includes('required') ||
        error.message.includes('already exists') ||
        error.message.includes('Invalid email')
      ) {
        throw error;
      }

      logger.error('Failed to create shipper', { data, error: error.message });
      throw new Error('Failed to create shipper');
    }
  }

  /**
   * Update shipper
   */
  async updateShipper(id: string, updates: UpdateShipperRequest): Promise<Shipper> {
    try {
      // Check if shipper exists
      const existing = await shipperRepository.findById(id);
      if (!existing) {
        throw new Error('Shipper not found');
      }

      // Validate email if provided
      if (updates.contact_email && !this.isValidEmail(updates.contact_email)) {
        throw new Error('Invalid email format');
      }

      return await shipperRepository.update(id, updates);
    } catch (error: any) {
      if (error.message === 'Shipper not found' || error.message.includes('Invalid email')) {
        throw error;
      }

      logger.error('Failed to update shipper', { id, updates, error: error.message });
      throw new Error('Failed to update shipper');
    }
  }

  /**
   * Delete shipper (soft delete)
   */
  async deleteShipper(id: string): Promise<void> {
    try {
      // Check if shipper exists
      const existing = await shipperRepository.findById(id);
      if (!existing) {
        throw new Error('Shipper not found');
      }

      await shipperRepository.delete(id);
    } catch (error: any) {
      if (error.message === 'Shipper not found') {
        throw error;
      }

      logger.error('Failed to delete shipper', { id, error: error.message });
      throw new Error('Failed to delete shipper');
    }
  }

  /**
   * Activate shipper
   */
  async activateShipper(id: string): Promise<Shipper> {
    try {
      const existing = await shipperRepository.findById(id);
      if (!existing) {
        throw new Error('Shipper not found');
      }

      return await shipperRepository.activate(id);
    } catch (error: any) {
      if (error.message === 'Shipper not found') {
        throw error;
      }

      logger.error('Failed to activate shipper', { id, error: error.message });
      throw new Error('Failed to activate shipper');
    }
  }

  /**
   * Deactivate shipper
   */
  async deactivateShipper(id: string): Promise<Shipper> {
    try {
      const existing = await shipperRepository.findById(id);
      if (!existing) {
        throw new Error('Shipper not found');
      }

      return await shipperRepository.deactivate(id);
    } catch (error: any) {
      if (error.message === 'Shipper not found') {
        throw error;
      }

      logger.error('Failed to deactivate shipper', { id, error: error.message });
      throw new Error('Failed to deactivate shipper');
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

export default new ShipperService();
