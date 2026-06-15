import * as expensesService from './expenses.service.js';

export async function createExpense(req, res) {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const data = req.body || {};

    if (!data.description || !data.amount || !data.paidById || !data.splitType || !data.participants) {
      return res.status(400).json({ error: 'Missing required fields for expense creation' });
    }

    const expense = await expensesService.createExpense(userId, groupId, data);
    res.status(201).json({ message: 'Expense created successfully', expense });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function getGroupExpenses(req, res) {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const expenses = await expensesService.getGroupExpenses(groupId, userId);
    res.status(200).json({ expenses });
  } catch (error) {
    res.status(403).json({ error: error.message });
  }
}

export async function updateExpense(req, res) {
  try {
    const { groupId, expenseId } = req.params;
    const userId = req.user.id;
    const data = req.body || {};

    if (!data.description || !data.amount || !data.paidById || !data.splitType || !data.participants) {
      return res.status(400).json({ error: 'Missing required fields for expense update' });
    }

    const expense = await expensesService.updateExpense(userId, groupId, expenseId, data);
    res.status(200).json({ message: 'Expense updated successfully', expense });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function deleteExpense(req, res) {
  try {
    const { groupId, expenseId } = req.params;
    const userId = req.user.id;
    
    await expensesService.deleteExpense(userId, groupId, expenseId);
    res.status(200).json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
