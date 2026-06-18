import { Router } from 'express';
import { alertController } from '../controllers/alertController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', alertController.list);
router.get('/unresolved', alertController.unresolved);
router.post('/:id/resolve', requireAuth, alertController.resolve);

export default router;
