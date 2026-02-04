import { Router } from 'express';
import { authenticateRequest } from '../../../middleware/auth.middleware';
import builderRouter from './builder';
import manualEntriesRouter from './manual-entries';

const router = Router();

//All workflow routes require authentication
router.use(authenticateRequest);

// Mount workflow builder routes
router.use('/builder', builderRouter);

// Mount manual entries routes
router.use('/', manualEntriesRouter);

// For backward compatibility, proxy some routes to builder
// router.get('/definitions', (req, res, next) => {
//   req.url = '/builder' + req.url.replace('/definitions', '');
//   builderRouter(req, res, next);
// });

// router.get('/instances', (req, res, next) => {
//   req.url = '/builder/instances';
//   builderRouter(req, res, next);
// });

export default router;
