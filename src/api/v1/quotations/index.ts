import { Router, Response } from 'express';
import { authenticateRequest, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import quotationService, {
  QuotationError,
  QuotationNotFoundError,
  InvalidStatusTransitionError,
} from '../../../services/quotation.service';
import { logger } from '../../../utils/logger';

const router = Router();
router.use(authenticateRequest);

// ============================================================================
// GET /api/v1/quotations - List quotations with filters
// ============================================================================
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      status,
      customer_id,
      shipment_type,
      created_by,
      dateFrom,
      dateTo,
      search,
      expired,
      page = '1',
      limit = '20',
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = req.query;

    // Build filters
    const filters: any = {};
    if (status) filters.status = (status as string).split(',');
    if (customer_id) filters.customer_id = customer_id as string;
    if (shipment_type) filters.shipment_type = shipment_type as string;
    if (created_by) filters.created_by = created_by as string;
    if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
    if (dateTo) filters.dateTo = new Date(dateTo as string);
    if (search) filters.search = search as string;
    if (expired !== undefined) filters.expired = expired === 'true';

    // Pagination
    const pagination = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
    };

    const result = await quotationService.getQuotations(filters, pagination);

    res.json({
      success: true,
      data: result.quotations,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error: any) {
    logger.error('Error in GET /quotations', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quotations',
    });
  }
});

// ============================================================================
// GET /api/v1/quotations/expiring - Get quotations expiring soon
// ============================================================================
router.get('/expiring', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { days = '7' } = req.query;
    const quotations = await quotationService.getExpiringSoonQuotations(parseInt(days as string));

    res.json({
      success: true,
      data: quotations,
      count: quotations.length,
    });
  } catch (error: any) {
    logger.error('Error in GET /quotations/expiring', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch expiring quotations',
    });
  }
});

// ============================================================================
// GET /api/v1/quotations/:id - Get quotation by ID
// ============================================================================
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const quotation = await quotationService.getQuotationById(id);

    res.json({
      success: true,
      data: quotation,
    });
  } catch (error: any) {
    if (error instanceof QuotationNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in GET /quotations/:id', { id: req.params.id, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quotation',
    });
  }
});

// ============================================================================
// POST /api/v1/quotations - Create new quotation
// ============================================================================
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const quotation = await quotationService.createQuotation(req.body, userId);

    res.status(201).json({
      success: true,
      data: quotation,
      message: 'Quotation created successfully',
    });
  } catch (error: any) {
    if (error instanceof QuotationError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in POST /quotations', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create quotation',
    });
  }
});

// ============================================================================
// PATCH /api/v1/quotations/:id - Update quotation
// ============================================================================
router.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const quotation = await quotationService.updateQuotation(id, req.body);

    res.json({
      success: true,
      data: quotation,
      message: 'Quotation updated successfully',
    });
  } catch (error: any) {
    if (error instanceof QuotationNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof QuotationError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in PATCH /quotations/:id', { id: req.params.id, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update quotation',
    });
  }
});

// ============================================================================
// PATCH /api/v1/quotations/:id/status - Update quotation status
// ============================================================================
router.patch('/:id/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user?.id;

    if (!status) {
      res.status(400).json({
        success: false,
        error: 'Status is required',
      });
      return;
    }

    const quotation = await quotationService.updateQuotationStatus(id, status, userId);

    res.json({
      success: true,
      data: quotation,
      message: `Quotation status updated to ${status}`,
    });
  } catch (error: any) {
    if (error instanceof QuotationNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof InvalidStatusTransitionError) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof QuotationError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in PATCH /quotations/:id/status', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update quotation status',
    });
  }
});

// ============================================================================
// POST /api/v1/quotations/:id/send - Send quotation to customer
// ============================================================================
router.post('/:id/send', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const quotation = await quotationService.sendQuotation(id, userId);

    res.json({
      success: true,
      data: quotation,
      message: 'Quotation sent to customer',
    });
  } catch (error: any) {
    if (error instanceof QuotationNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof InvalidStatusTransitionError) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof QuotationError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in POST /quotations/:id/send', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to send quotation',
    });
  }
});

// ============================================================================
// POST /api/v1/quotations/:id/accept - Accept quotation
// ============================================================================
router.post('/:id/accept', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const quotation = await quotationService.acceptQuotation(id);

    res.json({
      success: true,
      data: quotation,
      message: 'Quotation accepted',
    });
  } catch (error: any) {
    if (error instanceof QuotationNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof InvalidStatusTransitionError) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof QuotationError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in POST /quotations/:id/accept', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to accept quotation',
    });
  }
});

// ============================================================================
// POST /api/v1/quotations/find-rates - Find matching rate cards for quotation
// ============================================================================
router.post('/find-rates', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { origin, destination, chargeable_weight, shipment_type } = req.body;

    // Validation
    if (!origin || !destination || !chargeable_weight || !shipment_type) {
      res.status(400).json({
        success: false,
        error: 'origin, destination, chargeable_weight, and shipment_type are required',
      });
      return;
    }

    const rateCards = await quotationService.findMatchingRateCards(
      origin,
      destination,
      parseFloat(chargeable_weight),
      shipment_type
    );

    res.json({
      success: true,
      data: rateCards,
      count: rateCards.length,
    });
  } catch (error: any) {
    if (error instanceof QuotationError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in POST /quotations/find-rates', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to find matching rate cards',
    });
  }
});

// ============================================================================
// POST /api/v1/quotations/auto-generate - Auto-generate quotation from rate card
// ============================================================================
router.post('/auto-generate', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const result = await quotationService.autoGenerateQuotation(req.body, userId);

    res.status(201).json({
      success: true,
      data: {
        quotation: result.quotation,
        rate_card: result.rate_card,
        cost_calculation: result.cost_calculation,
      },
      message: 'Quotation auto-generated successfully',
    });
  } catch (error: any) {
    if (error instanceof QuotationError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in POST /quotations/auto-generate', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to auto-generate quotation',
    });
  }
});

// ============================================================================
// DELETE /api/v1/quotations/:id - Delete quotation
// ============================================================================
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await quotationService.deleteQuotation(id);

    res.json({
      success: true,
      message: 'Quotation deleted successfully',
    });
  } catch (error: any) {
    if (error instanceof QuotationNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in DELETE /quotations/:id', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete quotation',
    });
  }
});

export default router;
