import * as settlementsService from './settlements.service.js';

export async function recordSettlement(req, res) {
  try {
    const { groupId } = req.params;
    const userId = req.user.id; // Currently logged in user
    const { receiverId, amount, currency, date } = req.body || {};

    if (!receiverId || !amount) {
      return res.status(400).json({ error: 'receiverId and amount are required' });
    }

    const settlement = await settlementsService.recordSettlement(groupId, userId, receiverId, amount, currency, date);
    res.status(201).json({ message: 'Settlement recorded successfully', settlement });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function getGroupSettlements(req, res) {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const settlements = await settlementsService.getGroupSettlements(groupId, userId);
    res.status(200).json({ settlements });
  } catch (error) {
    res.status(403).json({ error: error.message });
  }
}
