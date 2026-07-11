import { Router } from 'express';
import { detectionController } from '../controllers/detectionController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/:jobId/status', detectionController.getJobStatus);

export default router;
