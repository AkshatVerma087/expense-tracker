import { Router } from 'express';
import * as settlementsController from './settlements.controller.js';

const router = Router({ mergeParams: true });

router.post('/', settlementsController.recordSettlement);
router.get('/', settlementsController.getGroupSettlements);

export default router;
