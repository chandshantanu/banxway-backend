import { Router } from 'express';

const router = Router();

// TODO: Implement notes endpoints
router.get('/', (req, res) => {
  res.json({ success: true, data: [], message: 'Notes endpoint - TODO' });
});

export default router;
