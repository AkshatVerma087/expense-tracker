import * as importerService from './importer.service.js';

export async function uploadCSV(req, res) {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    const batchId = await importerService.processUpload(groupId, userId, req.file.path);
    res.status(202).json({ message: 'File uploaded and processing started', batchId });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function getBatchStatus(req, res) {
  try {
    const { groupId, batchId } = req.params;
    const batch = await importerService.getBatchStatus(groupId, batchId);
    res.status(200).json({ batch });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
}

export async function resolveRow(req, res) {
  try {
    const { batchId, rowId } = req.params;
    const { actionTaken, updatedParsedData } = req.body;
    
    const row = await importerService.resolveRow(batchId, rowId, actionTaken, updatedParsedData);
    res.status(200).json({ message: 'Row resolved', row });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function commitBatch(req, res) {
  try {
    const { groupId, batchId } = req.params;
    const userId = req.user.id;

    const result = await importerService.commitBatch(groupId, batchId, userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("commitBatch Error:", error);
    res.status(400).json({ error: error.message });
  }
}

export async function downloadReport(req, res) {
  try {
    const { groupId, batchId } = req.params;
    const reportMd = await importerService.generateImportReport(groupId, batchId);
    
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename=IMPORT_REPORT_${batchId}.md`);
    res.status(200).send(reportMd);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
