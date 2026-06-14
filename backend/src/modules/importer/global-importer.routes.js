import { Router } from 'express';
import multer from 'multer';
import * as globalImporterController from './global-importer.controller.js';

const router = Router();
const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.single('file'), globalImporterController.uploadGlobalCSV);
router.get('/batches', globalImporterController.getAllBatches);

// Note: For these routes, we need to pass groupId in the URL, but the frontend 
// currently doesn't know it until upload finishes. Wait, our `globalImporterController.uploadGlobalCSV` 
// returns `groupId`. Frontend will use the new `groupId` to poll.
// So we can still use the old routes for status and commit!

export default router;
