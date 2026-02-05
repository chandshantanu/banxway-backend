import { Router } from 'express';
import { authenticateRequest } from '../../../middleware/auth.middleware';
import emailCountsRouter from './email-counts';

const router = Router();

// Require authentication for all debug routes  
router.use(authenticateRequest);

// Mount debug endpoints
router.use('/', emailCountsRouter);

export default router;
