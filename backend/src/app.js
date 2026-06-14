import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './modules/auth/auth.routes.js';
import groupsRoutes from './modules/groups/groups.routes.js';
import expensesRoutes from './modules/expenses/expenses.routes.js';
import balancesRoutes from './modules/balances/balances.routes.js';
import settlementsRoutes from './modules/settlements/settlements.routes.js';
import importerRoutes from './modules/importer/importer.routes.js';
import { authMiddleware } from './middleware/auth.middleware.js';

const app = express();

app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/groups', authMiddleware, groupsRoutes);
app.use('/api/groups/:groupId/expenses', authMiddleware, expensesRoutes);
app.use('/api/groups/:groupId/balances', authMiddleware, balancesRoutes);
app.use('/api/groups/:groupId/settlements', authMiddleware, settlementsRoutes);
app.use('/api/groups/:groupId/import', authMiddleware, importerRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

export default app;
