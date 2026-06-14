import { Router } from 'express';
import { register, login, googleAuth, refresh, logout } from './auth.controller.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/refresh', refresh);
router.post('/logout', logout);

export default router;
