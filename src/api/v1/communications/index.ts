import { Router } from 'express';
import { conditionalAuth } from '../../../middleware/dev-auth.middleware';
import threadsRouter from './threads';
import messagesRouter from './messages';
import actionsRouter from './actions';
import notesRouter from './notes';
import statsRouter from './stats';

const router = Router();

// All communications routes require authentication
// In development: uses dev bypass, In production: uses real JWT auth
router.use(conditionalAuth);

// Mount sub-routers
router.use('/stats', statsRouter);
router.use('/threads', threadsRouter);
router.use('/messages', messagesRouter);
router.use('/actions', actionsRouter);
router.use('/notes', notesRouter);

export default router;
