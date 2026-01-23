import { Router } from 'express';

const router = Router();

// TODO: Implement action endpoints
router.get('/', (req, res) => {
  res.json({ success: true, data: [], message: 'Actions endpoint - TODO' });
});

export default router;
