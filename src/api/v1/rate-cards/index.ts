/**
 * Rate Card API Routes
 *
 * Handles rate card management endpoints:
 * - GET /api/v1/rate-cards - List all rate cards
 * - GET /api/v1/rate-cards/active - Get active rate cards
 * - GET /api/v1/rate-cards/expiring - Get expiring rate cards
 * - GET /api/v1/rate-cards/search - Search rate cards by route
 * - GET /api/v1/rate-cards/:id - Get rate card by ID
 * - POST /api/v1/rate-cards/:id/calculate - Calculate freight cost
 */

import { Router, type Response } from 'express';
import { authenticateRequest, type AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { logger } from '../../../utils/logger';
import rateCardService from '../../../services/rate-card.service';

const router = Router();

// All routes require authentication
router.use(authenticateRequest);

/**
 * GET /api/v1/rate-cards
 * Get all rate cards with optional filters
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filters = {
      shipper_id: req.query.shipper_id as string | undefined,
      status: req.query.status as string | undefined,
      rate_type: req.query.rate_type as string | undefined,
      shipment_type: req.query.shipment_type as string | undefined,
      origin: req.query.origin as string | undefined,
      destination: req.query.destination as string | undefined,
      valid_on_date: req.query.valid_on_date as string | undefined,
    };

    const rateCards = await rateCardService.getRateCards(filters);

    res.json({
      success: true,
      data: rateCards,
      count: rateCards.length,
    });
  } catch (error: any) {
    logger.error('Failed to get rate cards', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve rate cards',
    });
  }
});

/**
 * GET /api/v1/rate-cards/active
 * Get all active rate cards
 */
router.get('/active', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rateCards = await rateCardService.getActiveRateCards();

    res.json({
      success: true,
      data: rateCards,
      count: rateCards.length,
    });
  } catch (error: any) {
    logger.error('Failed to get active rate cards', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve active rate cards',
    });
  }
});

/**
 * GET /api/v1/rate-cards/expiring
 * Get rate cards expiring soon
 */
router.get('/expiring', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const rateCards = await rateCardService.getExpiringRateCards(days);

    res.json({
      success: true,
      data: rateCards,
      count: rateCards.length,
    });
  } catch (error: any) {
    if (error.message.includes('must be between')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to get expiring rate cards', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve expiring rate cards',
    });
  }
});

/**
 * GET /api/v1/rate-cards/search
 * Search rate cards by route
 */
router.get('/search', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const search = {
      origin: req.query.origin as string | undefined,
      destination: req.query.destination as string | undefined,
      date: req.query.date as string | undefined,
      weight: req.query.weight ? parseFloat(req.query.weight as string) : undefined,
    };

    const rateCards = await rateCardService.searchRateCards(search);

    res.json({
      success: true,
      data: rateCards,
      count: rateCards.length,
    });
  } catch (error: any) {
    if (error.message.includes('required')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to search rate cards', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to search rate cards',
    });
  }
});

/**
 * GET /api/v1/rate-cards/:id
 * Get rate card by ID
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const rateCard = await rateCardService.getRateCardById(id);

    res.json({
      success: true,
      data: rateCard,
    });
  } catch (error: any) {
    if (error.message === 'Rate card not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to get rate card', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve rate card',
    });
  }
});

/**
 * POST /api/v1/rate-cards/:id/calculate
 * Calculate freight cost for a given weight
 */
router.post('/:id/calculate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { chargeable_weight } = req.body;

    if (!chargeable_weight || chargeable_weight <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid chargeable_weight is required',
      });
    }

    const rateCard = await rateCardService.getRateCardById(id);
    const calculation = rateCardService.calculateFreightCost(rateCard, chargeable_weight);

    if (!calculation) {
      return res.status(400).json({
        success: false,
        error: 'Unable to calculate cost - no applicable weight slab found',
      });
    }

    res.json({
      success: true,
      data: {
        rate_card_id: id,
        chargeable_weight,
        ...calculation,
      },
    });
  } catch (error: any) {
    if (error.message === 'Rate card not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to calculate freight cost', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to calculate freight cost',
    });
  }
});

/**
 * POST /api/v1/rate-cards
 * Create new rate card
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rateCard = await rateCardService.createRateCard(req.body);

    res.status(201).json({
      success: true,
      data: rateCard,
    });
  } catch (error: any) {
    if (error.message.includes('required') || error.message.includes('must')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to create rate card', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create rate card',
    });
  }
});

/**
 * PUT /api/v1/rate-cards/:id
 * Update rate card
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const rateCard = await rateCardService.updateRateCard(id, req.body);

    res.json({
      success: true,
      data: rateCard,
    });
  } catch (error: any) {
    if (error.message.includes('required') || error.message.includes('must')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to update rate card', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update rate card',
    });
  }
});

/**
 * DELETE /api/v1/rate-cards/:id
 * Delete rate card (soft delete)
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    await rateCardService.deleteRateCard(id);

    res.status(204).send();
  } catch (error: any) {
    if (error.message === 'Rate card not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to delete rate card', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete rate card',
    });
  }
});

/**
 * PATCH /api/v1/rate-cards/:id/activate
 * Activate rate card
 */
router.patch('/:id/activate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const rateCard = await rateCardService.activateRateCard(id);

    res.json({
      success: true,
      data: rateCard,
    });
  } catch (error: any) {
    logger.error('Failed to activate rate card', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to activate rate card',
    });
  }
});

/**
 * PATCH /api/v1/rate-cards/:id/deactivate
 * Deactivate rate card
 */
router.patch('/:id/deactivate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const rateCard = await rateCardService.deactivateRateCard(id);

    res.json({
      success: true,
      data: rateCard,
    });
  } catch (error: any) {
    logger.error('Failed to deactivate rate card', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate rate card',
    });
  }
});

export default router;
