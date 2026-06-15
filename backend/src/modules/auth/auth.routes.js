import { Router } from 'express';
import { register, login, googleAuth, refresh, logout, changePassword } from './auth.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.put('/password', authMiddleware, changePassword);

export default router;
