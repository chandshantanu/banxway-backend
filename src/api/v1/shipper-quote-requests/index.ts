import { Router, Response } from 'express';
import { authenticateRequest, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import shipperQuoteRequestService, {
  ShipperQuoteRequestError,
  ShipperQuoteRequestNotFoundError,
} from '../../../services/shipper-quote-request.service';
import { logger } from '../../../utils/logger';

const router = Router();
router.use(authenticateRequest);

// ============================================================================
// GET /api/v1/shipper-quote-requests - List all quote requests
// ============================================================================
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, shipper_id, quotation_id, requested_by, dateFrom, dateTo } = req.query;

    // Build filters
    const filters: any = {};
    if (status) filters.status = (status as string).split(',');
    if (shipper_id) filters.shipper_id = shipper_id as string;
    if (quotation_id) filters.quotation_id = quotation_id as string;
    if (requested_by) filters.requested_by = requested_by as string;
    if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
    if (dateTo) filters.dateTo = new Date(dateTo as string);

    const requests = await shipperQuoteRequestService.getShipperQuoteRequests(filters);

    res.json({
      success: true,
      data: requests,
      count: requests.length,
    });
  } catch (error: any) {
    logger.error('Error in GET /shipper-quote-requests', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shipper quote requests',
    });
  }
});

// ============================================================================
// GET /api/v1/shipper-quote-requests/pending - Get pending requests
// ============================================================================
router.get('/pending', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const requests = await shipperQuoteRequestService.getPendingQuoteRequests();

    res.json({
      success: true,
      data: requests,
      count: requests.length,
    });
  } catch (error: any) {
    logger.error('Error in GET /shipper-quote-requests/pending', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending quote requests',
    });
  }
});

// ============================================================================
// GET /api/v1/shipper-quote-requests/received - Get received requests
// ============================================================================
router.get('/received', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const requests = await shipperQuoteRequestService.getReceivedQuoteRequests();

    res.json({
      success: true,
      data: requests,
      count: requests.length,
    });
  } catch (error: any) {
    logger.error('Error in GET /shipper-quote-requests/received', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch received quote requests',
    });
  }
});

// ============================================================================
// GET /api/v1/shipper-quote-requests/:id - Get request by ID
// ============================================================================
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const request = await shipperQuoteRequestService.getShipperQuoteRequestById(id);

    res.json({
      success: true,
      data: request,
    });
  } catch (error: any) {
    if (error instanceof ShipperQuoteRequestNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in GET /shipper-quote-requests/:id', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shipper quote request',
    });
  }
});

// ============================================================================
// POST /api/v1/shipper-quote-requests - Create new quote request
// ============================================================================
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const request = await shipperQuoteRequestService.createShipperQuoteRequest(req.body, userId);

    res.status(201).json({
      success: true,
      data: request,
      message: 'Shipper quote request created successfully',
    });
  } catch (error: any) {
    if (error instanceof ShipperQuoteRequestError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in POST /shipper-quote-requests', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create shipper quote request',
    });
  }
});

// ============================================================================
// PATCH /api/v1/shipper-quote-requests/:id - Update quote request
// ============================================================================
router.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const request = await shipperQuoteRequestService.updateShipperQuoteRequest(id, req.body);

    res.json({
      success: true,
      data: request,
      message: 'Shipper quote request updated successfully',
    });
  } catch (error: any) {
    if (error instanceof ShipperQuoteRequestNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof ShipperQuoteRequestError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in PATCH /shipper-quote-requests/:id', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update shipper quote request',
    });
  }
});

// ============================================================================
// PATCH /api/v1/shipper-quote-requests/:id/status - Update status
// ============================================================================
router.patch('/:id/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({
        success: false,
        error: 'Status is required',
      });
      return;
    }

    const request = await shipperQuoteRequestService.updateShipperQuoteRequestStatus(id, status);

    res.json({
      success: true,
      data: request,
      message: `Quote request status updated to ${status}`,
    });
  } catch (error: any) {
    if (error instanceof ShipperQuoteRequestNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof ShipperQuoteRequestError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in PATCH /shipper-quote-requests/:id/status', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update quote request status',
    });
  }
});

// ============================================================================
// POST /api/v1/shipper-quote-requests/:id/response - Record shipper response
// ============================================================================
router.post('/:id/response', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const request = await shipperQuoteRequestService.recordShipperResponse(id, req.body);

    res.json({
      success: true,
      data: request,
      message: 'Shipper response recorded successfully',
    });
  } catch (error: any) {
    if (error instanceof ShipperQuoteRequestNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof ShipperQuoteRequestError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in POST /shipper-quote-requests/:id/response', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to record shipper response',
    });
  }
});

// ============================================================================
// POST /api/v1/shipper-quote-requests/:id/convert - Convert to quotation
// ============================================================================
router.post('/:id/convert', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const result = await shipperQuoteRequestService.convertToQuotation(id, req.body, userId);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Shipper quote converted to customer quotation successfully',
    });
  } catch (error: any) {
    if (error instanceof ShipperQuoteRequestNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof ShipperQuoteRequestError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in POST /shipper-quote-requests/:id/convert', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to convert to quotation',
    });
  }
});

// ============================================================================
// DELETE /api/v1/shipper-quote-requests/:id - Delete quote request
// ============================================================================
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await shipperQuoteRequestService.deleteShipperQuoteRequest(id);

    res.json({
      success: true,
      message: 'Shipper quote request deleted successfully',
    });
  } catch (error: any) {
    if (error instanceof ShipperQuoteRequestNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in DELETE /shipper-quote-requests/:id', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete shipper quote request',
    });
  }
});

export default router;
