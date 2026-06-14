import fs from 'fs';
import csv from 'csv-parser';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import * as importerService from './importer.service.js';

const prisma = new PrismaClient();

export async function uploadGlobalCSV(req, res) {
  try {
    const adminUserId = req.user.id;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    const filePath = req.file.path;
    const paidByNames = new Set();

    // 1. Read CSV to extract all unique "Paid By" names
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
           const payer = row['Paid By'] || row['paid_by'] || row['Paid by'];
           if (payer) {
             paidByNames.add(payer.trim());
           }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Don't add admin to paidByNames yet, we'll handle them explicitly
    const adminUser = await prisma.user.findUnique({ where: { id: adminUserId } });

    // 2. Create the auto-generated group
    const newGroup = await prisma.group.create({
      data: {
        name: `Imported CSV - ${new Date().toLocaleDateString()}`,
        description: 'Auto-generated group from CSV import',
        currency: 'INR',
        creatorId: adminUserId,
        members: {
          create: {
            userId: adminUserId,
            role: 'ADMIN'
          }
        }
      }
    });

    // Explicitly add admin
    await prisma.groupMember.create({
      data: {
        groupId: newGroup.id,
        userId: adminUserId,
        role: 'ADMIN'
      }
    });

    // 3. Ensure all other users exist and add them to the group
    for (const name of paidByNames) {
      if (adminUser && name.toLowerCase() === adminUser.name.toLowerCase()) continue;

      // Find user by name
      let user = await prisma.user.findFirst({
        where: { name: name }
      });

      if (!user) {
        // Create shadow user
        const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        user = await prisma.user.create({
          data: {
            name: name,
            email: `${safeName}-${Date.now()}@splitease.local`,
            passwordHash: 'shadow_account_no_login'
          }
        });
      }

      // Add to group
      await prisma.groupMember.create({
        data: {
          groupId: newGroup.id,
          userId: user.id,
          role: 'MEMBER'
        }
      });
    }

    // 4. Proceed with normal import processing
    const batchId = await importerService.processUpload(newGroup.id, adminUserId, filePath);
    
    res.status(202).json({ 
      message: 'File uploaded and processing started', 
      batchId,
      groupId: newGroup.id // Return the auto-generated group ID so frontend can redirect later
    });
  } catch (error) {
    console.error('GLOBAL IMPORTER ERROR:', error);
    res.status(400).json({ error: error.message });
  }
}

// Proxies to existing controller methods, but we just re-export them
import * as baseImporterController from './importer.controller.js';
export const getBatchStatus = baseImporterController.getBatchStatus;
export const resolveRow = baseImporterController.resolveRow;
export const commitBatch = baseImporterController.commitBatch;
