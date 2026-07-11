import { Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const authController = {
  async register(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email, password, name, role } = req.body;
      const result = await authService.register(email, password, name, role);
      res.status(201).json({ success: true, data: result, message: 'Registration successful' });
    } catch (error) {
      next(error);
    }
  },

  async login(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      res.json({ success: true, data: result, message: 'Login successful' });
    } catch (error) {
      next(error);
    }
  },

  async me(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'unauthorized');
      const profile = await authService.getProfile(Number(req.user.id));
      res.json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  },

  async logout(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const header = req.headers.authorization;
      if (header?.startsWith('Bearer ')) {
        await authService.logout(header.slice(7));
      }
      res.json({ success: true, message: 'Logged out' });
    } catch (error) {
      next(error);
    }
  },
};
