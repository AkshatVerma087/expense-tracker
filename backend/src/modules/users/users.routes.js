import express from 'express';
import { getDashboardMetrics } from './users.controller.js';

const router = express.Router();

router.get('/me/dashboard', getDashboardMetrics);

export default router;
