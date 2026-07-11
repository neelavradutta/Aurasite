import { Router } from 'express';
import Camera from '../models/Camera';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/locations', async (_req, res, next) => {
  try {
    const cameras = await Camera.findAll({
      attributes: ['video_source', 'name', 'latitude', 'longitude', 'camera_code'],
      order: [['camera_code', 'ASC']],
    });

    res.json({
      success: true,
      data: cameras.map((camera) => ({
        video_source: camera.video_source,
        name: camera.name,
        latitude: camera.latitude != null ? Number(camera.latitude) : null,
        longitude: camera.longitude != null ? Number(camera.longitude) : null,
        camera_code: camera.camera_code,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
