import { Router } from 'express';
import * as balancesController from './balances.controller.js';

const router = Router({ mergeParams: true });

router.get('/', balancesController.getGroupBalances);

export default router;
