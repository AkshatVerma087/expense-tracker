import { Router } from 'express';
import * as expensesController from './expenses.controller.js';

// Note: These routes will be mounted at /api/groups/:groupId/expenses
const router = Router({ mergeParams: true });

router.post('/', expensesController.createExpense);
router.get('/', expensesController.getGroupExpenses);

export default router;
