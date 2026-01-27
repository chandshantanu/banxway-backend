import { Router, Response } from 'express';
import { authenticateRequest, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import crmService, {
  CrmError,
  CustomerNotFoundError,
  DuplicateCustomerError,
} from '../../../services/crm.service';
import { logger } from '../../../utils/logger';

const router = Router();
router.use(authenticateRequest);

// ============================================================================
// GET /api/v1/crm/customers - List customers with filters
// ============================================================================
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      status,
      kyc_status,
      customer_tier,
      account_manager,
      lead_source,
      tags,
      search,
      page = '1',
      limit = '20',
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = req.query;

    // Build filters
    const filters: any = {};
    if (status) filters.status = (status as string).split(',');
    if (kyc_status) filters.kyc_status = (kyc_status as string).split(',');
    if (customer_tier) filters.customer_tier = (customer_tier as string).split(',');
    if (account_manager) filters.account_manager = account_manager as string;
    if (lead_source) filters.lead_source = lead_source as string;
    if (tags) filters.tags = (tags as string).split(',');
    if (search) filters.search = search as string;

    // Pagination
    const pagination = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
    };

    const result = await crmService.getCustomers(filters, pagination);

    res.json({
      success: true,
      data: result.customers,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error: any) {
    logger.error('Error in GET /crm/customers', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customers',
    });
  }
});

// ============================================================================
// GET /api/v1/crm/customers/pending-kyc - Get customers with pending KYC
// ============================================================================
router.get('/pending-kyc', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const customers = await crmService.getPendingKycCustomers();

    res.json({
      success: true,
      data: customers,
      count: customers.length,
    });
  } catch (error: any) {
    logger.error('Error in GET /crm/customers/pending-kyc', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending KYC customers',
    });
  }
});

// ============================================================================
// GET /api/v1/crm/customers/:id - Get customer by ID
// ============================================================================
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const customer = await crmService.getCustomerById(id);

    res.json({
      success: true,
      data: customer,
    });
  } catch (error: any) {
    if (error instanceof CustomerNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in GET /crm/customers/:id', { id: req.params.id, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer',
    });
  }
});

// ============================================================================
// POST /api/v1/crm/customers - Create new customer
// ============================================================================
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const customer = await crmService.createCustomer(req.body);

    res.status(201).json({
      success: true,
      data: customer,
      message: 'Customer created successfully',
    });
  } catch (error: any) {
    if (error instanceof DuplicateCustomerError) {
      res.status(409).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof CrmError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in POST /crm/customers', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create customer',
    });
  }
});

// ============================================================================
// PATCH /api/v1/crm/customers/:id - Update customer
// ============================================================================
router.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const customer = await crmService.updateCustomer(id, req.body);

    res.json({
      success: true,
      data: customer,
      message: 'Customer updated successfully',
    });
  } catch (error: any) {
    if (error instanceof CustomerNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof DuplicateCustomerError) {
      res.status(409).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof CrmError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in PATCH /crm/customers/:id', { id: req.params.id, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update customer',
    });
  }
});

// ============================================================================
// POST /api/v1/crm/customers/:id/convert - Convert lead to customer
// ============================================================================
router.post('/:id/convert', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const customer = await crmService.convertLeadToCustomer(id, userId);

    res.json({
      success: true,
      data: customer,
      message: 'Lead converted to customer successfully',
    });
  } catch (error: any) {
    if (error instanceof CustomerNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof CrmError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in POST /crm/customers/:id/convert', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to convert lead',
    });
  }
});

// ============================================================================
// DELETE /api/v1/crm/customers/:id - Delete customer
// ============================================================================
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await crmService.deleteCustomer(id);

    res.json({
      success: true,
      message: 'Customer deleted successfully',
    });
  } catch (error: any) {
    if (error instanceof CustomerNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in DELETE /crm/customers/:id', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete customer',
    });
  }
});

// ============================================================================
// GET /api/v1/crm/customers/:id/contacts - Get customer contacts
// ============================================================================
router.get('/:id/contacts', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const contacts = await crmService.getCustomerContacts(id);

    res.json({
      success: true,
      data: contacts,
      count: contacts.length,
    });
  } catch (error: any) {
    if (error instanceof CustomerNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in GET /crm/customers/:id/contacts', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer contacts',
    });
  }
});

// ============================================================================
// POST /api/v1/crm/customers/:id/contacts - Create contact for customer
// ============================================================================
router.post('/:id/contacts', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Add customer_id to request body
    const contactData = {
      ...req.body,
      customer_id: id,
    };

    const contact = await crmService.createContact(contactData);

    res.status(201).json({
      success: true,
      data: contact,
      message: 'Contact created successfully',
    });
  } catch (error: any) {
    if (error instanceof CustomerNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof CrmError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in POST /crm/customers/:id/contacts', {
      id: req.params.id,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create contact',
    });
  }
});

export default router;
