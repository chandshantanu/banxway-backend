import { Router } from 'express';
import customersRouter from './customers';
import contactsRouter from './contacts';
import syncRouter from './sync';

const router = Router();

// Mount sub-routes
router.use('/customers', customersRouter);
router.use('/contacts', contactsRouter);
router.use('/sync', syncRouter);

export default router;
