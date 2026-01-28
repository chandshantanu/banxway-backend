import { Router } from 'express';
import { authenticateRequest, requirePermission, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { Permission } from '../../../utils/permissions';
import { CrmService, CrmError, CustomerNotFoundError } from '../../../services/crm.service';
import { logger } from '../../../utils/logger';

const router = Router();
const crmService = new CrmService();

router.use(authenticateRequest);

/**
 * GET /api/v1/customers
 * Get all customers with optional filters
 */
router.get('/', requirePermission(Permission.VIEW_CUSTOMERS), async (req: AuthenticatedRequest, res) => {
  try {
    const {
      status,
      tier,
      kyc_status,
      lead_source,
      assigned_to,
      search,
      page = '1',
      limit = '50',
    } = req.query;

    const filters: any = {};
    if (status) filters.status = status;
    if (tier) filters.tier = tier;
    if (kyc_status) filters.kyc_status = kyc_status;
    if (lead_source) filters.lead_source = lead_source;
    if (assigned_to) filters.assigned_to = assigned_to;
    if (search) filters.search = search;

    const pagination = {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
    };

    const result = await crmService.getCustomers(filters, pagination);

    res.json({
      success: true,
      data: result.customers,
      count: result.customers.length,
      total: result.total,
      page: result.page,
      pageSize: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error: any) {
    logger.error('Error in GET /customers', { error: error.message });

    if (error instanceof CrmError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customers',
    });
  }
});

/**
 * GET /api/v1/customers/:id
 * Get customer by ID
 */
router.get('/:id', requirePermission(Permission.VIEW_CUSTOMERS), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const customer = await crmService.getCustomerById(id);

    res.json({
      success: true,
      data: customer,
    });
  } catch (error: any) {
    logger.error('Error in GET /customers/:id', { id: req.params.id, error: error.message });

    if (error instanceof CustomerNotFoundError) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error instanceof CrmError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customer',
    });
  }
});

/**
 * POST /api/v1/customers
 * Create new customer
 */
router.post('/', requirePermission(Permission.CREATE_CUSTOMERS), async (req: AuthenticatedRequest, res) => {
  try {
    const customer = await crmService.createCustomer(req.body);

    logger.info('Customer created via API', {
      id: customer.id,
      customer_code: customer.customer_code,
      created_by: req.user?.id,
    });

    res.status(201).json({
      success: true,
      data: customer,
    });
  } catch (error: any) {
    logger.error('Error in POST /customers', { error: error.message, body: req.body });

    if (error instanceof CrmError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create customer',
    });
  }
});

/**
 * PATCH /api/v1/customers/:id
 * Update customer
 */
router.patch('/:id', requirePermission(Permission.UPDATE_CUSTOMERS), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const customer = await crmService.updateCustomer(id, req.body);

    logger.info('Customer updated via API', {
      id,
      updated_by: req.user?.id,
    });

    res.json({
      success: true,
      data: customer,
    });
  } catch (error: any) {
    logger.error('Error in PATCH /customers/:id', { id: req.params.id, error: error.message });

    if (error instanceof CustomerNotFoundError) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error instanceof CrmError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update customer',
    });
  }
});

/**
 * POST /api/v1/customers/:id/convert
 * Convert lead to customer
 */
router.post('/:id/convert', requirePermission(Permission.UPDATE_CUSTOMERS), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const customer = await crmService.convertLeadToCustomer(id, req.user?.id);

    logger.info('Lead converted to customer via API', {
      id,
      customer_code: customer.customer_code,
      converted_by: req.user?.id,
    });

    res.json({
      success: true,
      data: customer,
    });
  } catch (error: any) {
    logger.error('Error in POST /customers/:id/convert', { id: req.params.id, error: error.message });

    if (error instanceof CustomerNotFoundError) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error instanceof CrmError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to convert lead',
    });
  }
});

/**
 * DELETE /api/v1/customers/:id
 * Delete customer
 */
router.delete('/:id', requirePermission(Permission.DELETE_CUSTOMERS), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    await crmService.deleteCustomer(id);

    logger.info('Customer deleted via API', {
      id,
      deleted_by: req.user?.id,
    });

    res.status(204).send();
  } catch (error: any) {
    logger.error('Error in DELETE /customers/:id', { id: req.params.id, error: error.message });

    if (error instanceof CustomerNotFoundError) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error instanceof CrmError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete customer',
    });
  }
});

/**
 * GET /api/v1/customers/:id/contacts
 * Get contacts for a customer
 */
router.get('/:id/contacts', requirePermission(Permission.VIEW_CUSTOMERS), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const contacts = await crmService.getCustomerContacts(id);

    res.json({
      success: true,
      data: contacts,
      count: contacts.length,
    });
  } catch (error: any) {
    logger.error('Error in GET /customers/:id/contacts', { id: req.params.id, error: error.message });

    if (error instanceof CustomerNotFoundError) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error instanceof CrmError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve contacts',
    });
  }
});

/**
 * POST /api/v1/customers/:id/contacts
 * Create contact for a customer
 */
router.post('/:id/contacts', requirePermission(Permission.CREATE_CUSTOMERS), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const contactData = {
      ...req.body,
      customer_id: id,
    };

    const contact = await crmService.createContact(contactData);

    logger.info('Contact created via API', {
      id: contact.id,
      customer_id: id,
      created_by: req.user?.id,
    });

    res.status(201).json({
      success: true,
      data: contact,
    });
  } catch (error: any) {
    logger.error('Error in POST /customers/:id/contacts', { id: req.params.id, error: error.message });

    if (error instanceof CustomerNotFoundError) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error instanceof CrmError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create contact',
    });
  }
});

export default router;
