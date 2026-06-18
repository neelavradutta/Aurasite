import { Router } from 'express';
import { detectionController } from '../controllers/detectionController';

const router = Router();

router.get('/:jobId/status', detectionController.getJobStatus);

export default router;
