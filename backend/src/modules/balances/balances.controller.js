import * as balancesService from './balances.service.js';

export async function getGroupBalances(req, res) {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const data = await balancesService.getGroupBalances(groupId, userId);
    res.status(200).json(data);
  } catch (error) {
    res.status(403).json({ error: error.message });
  }
}
