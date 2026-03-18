import { Router } from 'express';
import { authenticateRequest } from '../../../middleware/auth.middleware';
import threadsRouter from './threads';
import messagesRouter from './messages';
import actionsRouter from './actions';
import notesRouter from './notes';
import statsRouter from './stats';

const router = Router();

// All communications routes require authentication
router.use(authenticateRequest);

// Mount sub-routers
router.use('/stats', statsRouter);
router.use('/threads', threadsRouter);
router.use('/messages', messagesRouter);
router.use('/actions', actionsRouter);
router.use('/notes', notesRouter);

export default router;
