/**
 * Shipper API Routes
 *
 * Handles shipper management endpoints:
 * - GET /api/v1/shippers - List all shippers
 * - GET /api/v1/shippers/:id - Get shipper by ID
 * - POST /api/v1/shippers - Create shipper
 * - PUT /api/v1/shippers/:id - Update shipper
 * - DELETE /api/v1/shippers/:id - Delete shipper
 * - PATCH /api/v1/shippers/:id/activate - Activate shipper
 * - PATCH /api/v1/shippers/:id/deactivate - Deactivate shipper
 */

import { Router, type Response } from 'express';
import { authenticateRequest, type AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { logger } from '../../../utils/logger';
import shipperService from '../../../services/shipper.service';

const router = Router();

// All routes require authentication
router.use(authenticateRequest);

/**
 * GET /api/v1/shippers
 * Get all shippers with optional filters
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filters = {
      shipper_type: req.query.shipper_type as string | undefined,
      is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
      search: req.query.search as string | undefined,
    };

    const shippers = await shipperService.getShippers(filters);

    res.json({
      success: true,
      data: shippers,
      count: shippers.length,
    });
  } catch (error: any) {
    logger.error('Failed to get shippers', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve shippers',
    });
  }
});

/**
 * GET /api/v1/shippers/:id
 * Get shipper by ID
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const shipper = await shipperService.getShipperById(id);

    res.json({
      success: true,
      data: shipper,
    });
  } catch (error: any) {
    if (error.message === 'Shipper not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to get shipper', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve shipper',
    });
  }
});

/**
 * POST /api/v1/shippers
 * Create new shipper
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const shipper = await shipperService.createShipper(req.body);

    res.status(201).json({
      success: true,
      data: shipper,
    });
  } catch (error: any) {
    if (
      error.message.includes('required') ||
      error.message.includes('already exists') ||
      error.message.includes('Invalid email')
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to create shipper', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create shipper',
    });
  }
});

/**
 * PUT /api/v1/shippers/:id
 * Update shipper
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const shipper = await shipperService.updateShipper(id, req.body);

    res.json({
      success: true,
      data: shipper,
    });
  } catch (error: any) {
    if (error.message === 'Shipper not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes('Invalid email')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to update shipper', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update shipper',
    });
  }
});

/**
 * DELETE /api/v1/shippers/:id
 * Delete shipper (soft delete)
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    await shipperService.deleteShipper(id);

    res.json({
      success: true,
      message: 'Shipper deleted successfully',
    });
  } catch (error: any) {
    if (error.message === 'Shipper not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to delete shipper', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete shipper',
    });
  }
});

/**
 * PATCH /api/v1/shippers/:id/activate
 * Activate shipper
 */
router.patch('/:id/activate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const shipper = await shipperService.activateShipper(id);

    res.json({
      success: true,
      data: shipper,
      message: 'Shipper activated successfully',
    });
  } catch (error: any) {
    if (error.message === 'Shipper not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to activate shipper', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to activate shipper',
    });
  }
});

/**
 * PATCH /api/v1/shippers/:id/deactivate
 * Deactivate shipper
 */
router.patch('/:id/deactivate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const shipper = await shipperService.deactivateShipper(id);

    res.json({
      success: true,
      data: shipper,
      message: 'Shipper deactivated successfully',
    });
  } catch (error: any) {
    if (error.message === 'Shipper not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to deactivate shipper', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate shipper',
    });
  }
});

export default router;
