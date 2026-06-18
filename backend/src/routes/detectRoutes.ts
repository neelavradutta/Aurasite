import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { detectionController } from '../controllers/detectionController';
import { streamController } from '../controllers/streamController';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const uploadDir = path.resolve(env.uploadDir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const VIDEO_EXTENSIONS = new Set(['.mp4', '.avi', '.mov', '.mkv', '.webm', '.wmv', '.flv', '.m4v']);
const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.gif',
  '.heic',
  '.heif',
  '.avif',
  '.jfif',
]);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const fallback = file.mimetype.startsWith('image/') ? '.jpg' : '.mp4';
    cb(null, `${uuidv4()}${ext || fallback}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isVideo = file.mimetype.startsWith('video/') || VIDEO_EXTENSIONS.has(ext);
    const isImage = file.mimetype.startsWith('image/') || IMAGE_EXTENSIONS.has(ext);
    if (isVideo || isImage) {
      cb(null, true);
    } else {
      cb(new Error('Only video and image files are allowed'));
    }
  },
});

const frameUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image frames are allowed'));
    }
  },
});

const router = Router();

function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('video_file')(req, res, (err) => {
    if (err) {
      next(new AppError(err.message, 400, 'upload_error'));
      return;
    }
    next();
  });
}

function handleFrameUpload(req: Request, res: Response, next: NextFunction) {
  frameUpload.single('frame')(req, res, (err) => {
    if (err) {
      next(new AppError(err.message, 400, 'upload_error'));
      return;
    }
    next();
  });
}

router.post('/', requireAuth, handleUpload, detectionController.processVideo);
router.post('/stream', requireAuth, streamController.startStream);
router.post('/stop', requireAuth, streamController.stopStream);
router.post('/live-frame', requireAuth, handleFrameUpload, streamController.detectLiveFrame);
router.post('/live-stop', requireAuth, streamController.stopLiveFrameSession);

export default router;
