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
    const csvDates = [];

    // 1. Read CSV to extract all unique names from "Paid By" and "split_with", and all dates
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
           const payer = row['Paid By'] || row['paid_by'] || row['Paid by'];
           if (payer) {
             paidByNames.add(payer.trim());
           }
           
           const splitWith = row['split_with'] || row['Split With'] || '';
           if (splitWith) {
             const parts = splitWith.split(/[;,]/).map(p => p.trim()).filter(Boolean);
             parts.forEach(p => paidByNames.add(p));
           }

           // Collect dates for Sam's Date-Gate fix
           const rawDate = row['Date'] || row['date'] || '';
           if (rawDate) csvDates.push(rawDate);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Determine earliest date from CSV (Sam's Rule: joinedAt must predate all expenses)
    let earliestJoinedAt = new Date();
    if (csvDates.length > 0) {
      const parsedDates = csvDates.map(d => {
        // Try common formats: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD
        const parts = d.split('/');
        if (parts.length === 3) {
          const p1 = parseInt(parts[0], 10);
          const p2 = parseInt(parts[1], 10);
          const p3 = parseInt(parts[2], 10);
          // Assume day > 12 means DD/MM/YYYY, otherwise MM/DD/YYYY
          if (p1 > 12) {
            return new Date(`${parts[2]}-${String(p2).padStart(2,'0')}-${String(p1).padStart(2,'0')}`);
          } else {
            return new Date(`${parts[2]}-${String(p1).padStart(2,'0')}-${String(p2).padStart(2,'0')}`);
          }
        }
        return new Date(d); // fallback for ISO dates
      }).filter(d => !isNaN(d.getTime()));
      
      if (parsedDates.length > 0) {
        earliestJoinedAt = new Date(Math.min(...parsedDates.map(d => d.getTime())));
      }
    }

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
            role: 'ADMIN',
            joinedAt: earliestJoinedAt  // Admin also joins at earliest date for correct balance history
          }
        }
      }
    });

    // Explicitly add admin (Already handled in nested create)

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

      // Add to group — use earliest CSV date so Sam's Date Gate doesn't block historical expenses
      await prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: newGroup.id, userId: user.id } },
        update: {},
        create: {
          groupId: newGroup.id,
          userId: user.id,
          role: 'MEMBER',
          joinedAt: earliestJoinedAt
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

export async function getAllBatches(req, res) {
  try {
    const userId = req.user.id;
    // Get all groups the user is a member of
    const memberships = await prisma.groupMember.findMany({
      where: { userId }
    });
    const groupIds = memberships.map(m => m.groupId);

    // Get all batches for these groups
    const batches = await prisma.importBatch.findMany({
      where: { groupId: { in: groupIds } },
      orderBy: { createdAt: 'desc' },
      include: {
        rows: {
          select: { status: true, anomalies: true }
        }
      }
    });

    const formattedBatches = batches.map(batch => {
      let totalRows = batch.rows.length;
      let resolvedRows = batch.rows.filter(r => r.status === 'RESOLVED').length;
      let anomalyCount = 0;
      
      batch.rows.forEach(r => {
        if (r.anomalies && Array.isArray(r.anomalies)) {
          anomalyCount += r.anomalies.filter(a => a.status !== 'RESOLVED').length;
        }
      });

      return {
        id: batch.id,
        groupId: batch.groupId,
        status: batch.status,
        createdAt: batch.createdAt,
        totalRows,
        resolvedRows,
        anomalyCount
      };
    });

    res.json({ batches: formattedBatches });
  } catch (err) {
    console.error('Error fetching batches:', err);
    res.status(500).json({ error: 'Failed to fetch import batches' });
  }
}
