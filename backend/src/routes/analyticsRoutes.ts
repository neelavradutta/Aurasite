import { Router } from 'express';
import { analyticsController } from '../controllers/analyticsController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/summary', analyticsController.summary);
router.get('/traffic', analyticsController.traffic);
router.get('/repeat', analyticsController.repeat);
router.get('/confidence', analyticsController.confidence);
router.get('/vehicles', analyticsController.vehicles);
router.get('/trends', analyticsController.trends);
router.get('/export/detections', requireAuth, analyticsController.exportDetections);
router.get('/export/vehicles', requireAuth, analyticsController.exportVehicles);

export default router;
