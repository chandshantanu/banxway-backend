import { Router } from 'express';
import customersRouter from './customers';
import contactsRouter from './contacts';
import syncRouter from './sync';
import interactionsRouter from './interactions';

const router = Router();

// Mount sub-routes
router.use('/customers', customersRouter);
router.use('/contacts', contactsRouter);
router.use('/sync', syncRouter);
router.use('/interactions', interactionsRouter);

export default router;
