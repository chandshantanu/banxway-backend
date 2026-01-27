/**
 * Rate Card Service
 *
 * Business logic for rate card management
 */

import rateCardRepository, {
  type RateCard,
  type RateCardWithShipper,
  type RateCardFilters,
  type CreateRateCardRequest,
  type UpdateRateCardRequest,
} from '../database/repositories/rate-card.repository';
import { logger } from '../utils/logger';

export interface RateCardSearch {
  origin?: string;
  destination?: string;
  date?: string;
  weight?: number;
}

class RateCardService {
  /**
   * Get all rate cards with optional filters
   */
  async getRateCards(filters?: RateCardFilters): Promise<RateCardWithShipper[]> {
    try {
      return await rateCardRepository.findAll(filters);
    } catch (error: any) {
      logger.error('Failed to get rate cards', { error: error.message });
      throw new Error('Failed to retrieve rate cards');
    }
  }

  /**
   * Get rate card by ID
   */
  async getRateCardById(id: string): Promise<RateCardWithShipper> {
    try {
      const rateCard = await rateCardRepository.findById(id);

      if (!rateCard) {
        throw new Error('Rate card not found');
      }

      return rateCard;
    } catch (error: any) {
      if (error.message === 'Rate card not found') {
        throw error;
      }

      logger.error('Failed to get rate card', { id, error: error.message });
      throw new Error('Failed to retrieve rate card');
    }
  }

  /**
   * Get active rate cards only
   */
  async getActiveRateCards(): Promise<RateCardWithShipper[]> {
    try {
      return await rateCardRepository.findActive();
    } catch (error: any) {
      logger.error('Failed to get active rate cards', { error: error.message });
      throw new Error('Failed to retrieve active rate cards');
    }
  }

  /**
   * Search rate cards by route and date
   */
  async searchRateCards(search: RateCardSearch): Promise<RateCardWithShipper[]> {
    try {
      if (!search.origin || !search.destination) {
        throw new Error('Origin and destination are required for search');
      }

      const rateCards = await rateCardRepository.findByRoute(
        search.origin,
        search.destination,
        search.date
      );

      // If weight is provided, filter to only rate cards that support that weight
      if (search.weight && search.weight > 0) {
        return rateCards.filter((rc) => {
          if (rc.min_weight_kg !== null && search.weight! < rc.min_weight_kg) {
            return false;
          }
          if (rc.max_weight_kg !== null && search.weight! > rc.max_weight_kg) {
            return false;
          }
          return true;
        });
      }

      return rateCards;
    } catch (error: any) {
      if (error.message.includes('required')) {
        throw error;
      }

      logger.error('Failed to search rate cards', { search, error: error.message });
      throw new Error('Failed to search rate cards');
    }
  }

  /**
   * Get expiring rate cards
   */
  async getExpiringRateCards(days: number = 30): Promise<RateCardWithShipper[]> {
    try {
      if (days < 1 || days > 365) {
        throw new Error('Days must be between 1 and 365');
      }

      return await rateCardRepository.findExpiringSoon(days);
    } catch (error: any) {
      if (error.message.includes('must be between')) {
        throw error;
      }

      logger.error('Failed to get expiring rate cards', { days, error: error.message });
      throw new Error('Failed to retrieve expiring rate cards');
    }
  }

  /**
   * Calculate freight cost from rate card and weight
   */
  calculateFreightCost(rateCard: RateCard, chargeableWeight: number): {
    freight_cost: number;
    applicable_rate: number;
    surcharge_amount: number;
    handling_charges: number;
    total_cost: number;
  } | null {
    try {
      // Find applicable weight slab
      const weightSlabs = rateCard.weight_slabs;
      if (!weightSlabs || !Array.isArray(weightSlabs)) {
        return null;
      }

      let applicableRate = 0;
      for (const slab of weightSlabs) {
        const minKg = parseFloat(slab.min_kg || 0);
        const maxKg = parseFloat(slab.max_kg || Infinity);
        const rate = parseFloat(slab.rate_per_kg || 0);

        if (chargeableWeight >= minKg && chargeableWeight <= maxKg) {
          applicableRate = rate;
          break;
        }
      }

      if (applicableRate === 0) {
        return null; // No applicable slab found
      }

      // Calculate freight
      const freightCost = chargeableWeight * applicableRate;

      // Calculate surcharges
      let surchargeAmount = 0;
      const surcharges = rateCard.surcharges || {};

      // FSC and SSC are percentages
      if (surcharges.FSC) {
        surchargeAmount += freightCost * parseFloat(surcharges.FSC);
      }

      if (surcharges.SSC) {
        surchargeAmount += freightCost * parseFloat(surcharges.SSC);
      }

      // DG and other flat charges
      if (surcharges.DG) {
        surchargeAmount += parseFloat(surcharges.DG);
      }

      // Handling charges
      const handlingCharges =
        (rateCard.origin_handling_charges || 0) + (rateCard.destination_handling_charges || 0);

      // Total
      const totalCost = freightCost + surchargeAmount + handlingCharges;

      return {
        freight_cost: freightCost,
        applicable_rate: applicableRate,
        surcharge_amount: surchargeAmount,
        handling_charges: handlingCharges,
        total_cost: totalCost,
      };
    } catch (error: any) {
      logger.error('Failed to calculate freight cost', {
        rateCardId: rateCard.id,
        weight: chargeableWeight,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Create new rate card with validation
   */
  async createRateCard(data: CreateRateCardRequest): Promise<RateCardWithShipper> {
    try {
      // Validation
      if (!data.shipper_id) {
        throw new Error('Shipper ID is required');
      }

      if (!data.rate_type) {
        throw new Error('Rate type is required');
      }

      if (!data.shipment_type) {
        throw new Error('Shipment type is required');
      }

      if (!data.valid_from || !data.valid_until) {
        throw new Error('Validity dates are required');
      }

      // Validate dates
      const validFrom = new Date(data.valid_from);
      const validUntil = new Date(data.valid_until);

      if (validUntil <= validFrom) {
        throw new Error('Valid until date must be after valid from date');
      }

      // Validate weight slabs
      if (!data.weight_slabs || !Array.isArray(data.weight_slabs) || data.weight_slabs.length === 0) {
        throw new Error('At least one weight slab is required');
      }

      // Validate each weight slab
      for (const slab of data.weight_slabs) {
        if (slab.min_kg === undefined || slab.max_kg === undefined || slab.rate_per_kg === undefined) {
          throw new Error('Weight slab must have min_kg, max_kg, and rate_per_kg');
        }

        if (slab.min_kg < 0 || slab.max_kg < 0 || slab.rate_per_kg < 0) {
          throw new Error('Weight slab values must be non-negative');
        }

        if (slab.max_kg !== Infinity && slab.max_kg <= slab.min_kg) {
          throw new Error('Weight slab max_kg must be greater than min_kg');
        }
      }

      return await rateCardRepository.create(data);
    } catch (error: any) {
      if (error.message.includes('required') || error.message.includes('must')) {
        throw error; // Re-throw validation errors
      }

      logger.error('Failed to create rate card', { error: error.message });
      throw new Error('Failed to create rate card');
    }
  }

  /**
   * Update rate card with validation
   */
  async updateRateCard(id: string, updates: UpdateRateCardRequest): Promise<RateCardWithShipper> {
    try {
      // Validate dates if provided
      if (updates.valid_from && updates.valid_until) {
        const validFrom = new Date(updates.valid_from);
        const validUntil = new Date(updates.valid_until);

        if (validUntil <= validFrom) {
          throw new Error('Valid until date must be after valid from date');
        }
      }

      // Validate weight slabs if provided
      if (updates.weight_slabs) {
        if (!Array.isArray(updates.weight_slabs) || updates.weight_slabs.length === 0) {
          throw new Error('At least one weight slab is required');
        }

        for (const slab of updates.weight_slabs) {
          if (slab.min_kg === undefined || slab.max_kg === undefined || slab.rate_per_kg === undefined) {
            throw new Error('Weight slab must have min_kg, max_kg, and rate_per_kg');
          }

          if (slab.min_kg < 0 || slab.max_kg < 0 || slab.rate_per_kg < 0) {
            throw new Error('Weight slab values must be non-negative');
          }

          if (slab.max_kg !== Infinity && slab.max_kg <= slab.min_kg) {
            throw new Error('Weight slab max_kg must be greater than min_kg');
          }
        }
      }

      return await rateCardRepository.update(id, updates);
    } catch (error: any) {
      if (error.message.includes('required') || error.message.includes('must')) {
        throw error; // Re-throw validation errors
      }

      logger.error('Failed to update rate card', { id, error: error.message });
      throw new Error('Failed to update rate card');
    }
  }

  /**
   * Delete rate card (soft delete)
   */
  async deleteRateCard(id: string): Promise<void> {
    try {
      // Verify rate card exists
      const rateCard = await rateCardRepository.findById(id);
      if (!rateCard) {
        throw new Error('Rate card not found');
      }

      await rateCardRepository.delete(id);
    } catch (error: any) {
      if (error.message === 'Rate card not found') {
        throw error;
      }

      logger.error('Failed to delete rate card', { id, error: error.message });
      throw new Error('Failed to delete rate card');
    }
  }

  /**
   * Activate rate card
   */
  async activateRateCard(id: string): Promise<RateCardWithShipper> {
    try {
      return await rateCardRepository.activate(id);
    } catch (error: any) {
      logger.error('Failed to activate rate card', { id, error: error.message });
      throw new Error('Failed to activate rate card');
    }
  }

  /**
   * Deactivate rate card
   */
  async deactivateRateCard(id: string): Promise<RateCardWithShipper> {
    try {
      return await rateCardRepository.deactivate(id);
    } catch (error: any) {
      logger.error('Failed to deactivate rate card', { id, error: error.message });
      throw new Error('Failed to deactivate rate card');
    }
  }
}

export default new RateCardService();
