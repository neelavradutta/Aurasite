import { Router } from 'express';
import { streamController } from '../controllers/streamController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/update', streamController.handleStreamUpdate);
router.get('/status', streamController.getStreamStatus);
router.get('/:streamId/preview', streamController.getStreamPreview);
router.get('/playback', streamController.proxyPlayback);

export default router;
