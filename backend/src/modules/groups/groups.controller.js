import * as groupsService from './groups.service.js';

export async function createGroup(req, res) {
  try {
    const { name, description, currency } = req.body || {};
    const userId = req.user.id; // Extracted from authMiddleware

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const group = await groupsService.createGroup(userId, name, description, currency);
    res.status(201).json({ message: 'Group created successfully', group });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function getUserGroups(req, res) {
  try {
    const userId = req.user.id;
    const groups = await groupsService.getUserGroups(userId);
    res.status(200).json({ groups });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function getGroupDetails(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const group = await groupsService.getGroupDetails(id, userId);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.status(200).json({ group });
  } catch (error) {
    res.status(403).json({ error: error.message });
  }
}

export async function addMember(req, res) {
  try {
    const { id } = req.params; // Group ID
    const { email } = req.body || {}; // Email of the user to add
    const adminUserId = req.user.id;

    if (!email) {
      return res.status(400).json({ error: 'Member email is required' });
    }

    const membership = await groupsService.addMember(id, adminUserId, email);
    res.status(201).json({ message: 'Member added successfully', membership });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function updateGroup(req, res) {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const adminUserId = req.user.id;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const group = await groupsService.updateGroup(id, adminUserId, name, description);
    res.status(200).json({ message: 'Group updated successfully', group });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function removeMember(req, res) {
  try {
    const { id, userId: memberId } = req.params;
    const adminUserId = req.user.id;
    const membership = await groupsService.removeMember(id, adminUserId, memberId);
    res.status(200).json({ message: 'Member removed successfully', membership });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
