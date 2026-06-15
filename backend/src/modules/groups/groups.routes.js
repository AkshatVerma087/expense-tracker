import { Router } from 'express';
import * as groupsController from './groups.controller.js';

const router = Router();

// All these routes will be protected by authMiddleware at the app level
router.post('/', groupsController.createGroup);
router.get('/', groupsController.getUserGroups);
router.get('/:id', groupsController.getGroupDetails);
router.put('/:id', groupsController.updateGroup);
router.post('/:id/members', groupsController.addMember);
router.put('/:id/members/:userId', groupsController.removeMember);

export default router;
