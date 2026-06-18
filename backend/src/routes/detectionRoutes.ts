import { Router } from 'express';
import { detectionController } from '../controllers/detectionController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', detectionController.listDetections);
router.post('/clear', requireAuth, detectionController.clearAll);
router.get('/:id/snapshot', detectionController.getSnapshot);
router.get('/:id', detectionController.getDetection);
router.post('/:id/verify', requireAuth, detectionController.verifyDetection);
router.delete('/:id', requireAuth, detectionController.deleteDetection);

export default router;
