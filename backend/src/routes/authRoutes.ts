import { Router } from 'express';
import Joi from 'joi';
import { authController } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { blockPublicRegisterInProduction } from '../middleware/security';
import { validateBody } from '../middleware/validation';

const router = Router();

const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).max(254).required(),
  password: Joi.string().min(6).required(),
});

const registerSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).max(254).required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(2).max(100).required(),
  role: Joi.string().valid('admin', 'operator', 'viewer').optional(),
});

router.post('/login', validateBody(loginSchema), authController.login);
router.post('/register', blockPublicRegisterInProduction, validateBody(registerSchema), authController.register);
router.post('/logout', authMiddleware, authController.logout);
router.get('/me', authMiddleware, authController.me);

export default router;
