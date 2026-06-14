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
