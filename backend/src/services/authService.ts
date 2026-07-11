import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/User';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { revokeToken } from '../utils/tokenBlacklist';

const SALT_ROUNDS = 10;

export const authService = {
  async register(email: string, password: string, name: string, role: User['role'] = 'operator') {
    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      throw new AppError('Email already registered', 409, 'email_exists');
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      email: email.toLowerCase(),
      password_hash,
      name,
      role,
    });

    return this.issueToken(user);
  },

  async login(email: string, password: string) {
    const user = await User.findOne({ where: { email: email.toLowerCase(), is_active: true } });
    if (!user) {
      throw new AppError('Invalid credentials', 401, 'invalid_credentials');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new AppError('Invalid credentials', 401, 'invalid_credentials');
    }

    return this.issueToken(user);
  },

  async getProfile(userId: number) {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'email', 'name', 'role', 'created_at'],
    });
    if (!user) throw new AppError('User not found', 404, 'not_found');
    return user;
  },

  issueToken(user: User) {
    const jti = uuidv4();
    const token = jwt.sign(
      { id: String(user.id), role: user.role, email: user.email },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'], jwtid: jti }
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  },

  async logout(token: string) {
    await revokeToken(token);
  },

  async ensureDefaultAdmin() {
    const count = await User.count();
    if (count > 0) return;

    await User.create({
      email: env.defaultAdminEmail,
      password_hash: await bcrypt.hash(env.defaultAdminPassword, SALT_ROUNDS),
      name: 'Admin',
      role: 'admin',
    });
  },
};
