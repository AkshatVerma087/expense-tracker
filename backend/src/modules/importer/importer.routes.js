import { Router } from 'express';
import multer from 'multer';
import * as importerController from './importer.controller.js';

const router = Router({ mergeParams: true });
const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.single('file'), importerController.uploadCSV);
router.get('/batches/:batchId', importerController.getBatchStatus);
router.post('/batches/:batchId/rows/:rowId/resolve', importerController.resolveRow);
router.post('/batches/:batchId/commit', importerController.commitBatch);
router.get('/batches/:batchId/report', importerController.downloadReport);

export default router;
