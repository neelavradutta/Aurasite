import { Router } from 'express';
import { vehicleController } from '../controllers/vehicleController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', vehicleController.list);
router.get('/search', vehicleController.search);
router.get('/repeat/analysis', vehicleController.repeatAnalysis);
router.get('/:id', vehicleController.getById);
router.put('/:id', requireAuth, vehicleController.update);
router.post('/:id/flag', requireAuth, vehicleController.flag);
router.post('/:id/status', requireAuth, vehicleController.setStatus);

export default router;
