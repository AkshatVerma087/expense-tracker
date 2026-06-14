import pkg from '@prisma/client';
const { PrismaClient, Prisma } = pkg;
const { Decimal } = Prisma;
import fs from 'fs';
import csv from 'csv-parser';
import axios from 'axios';
import { detectAnomalies } from './anomalyEngine.js';

const prisma = new PrismaClient();

export async function processUpload(groupId, userId, filePath) {
  // 1. Verify user is in the group
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } }
  });
  if (!membership || membership.leftAt) {
    throw new Error('You do not have permission to import into this group');
  }

  // Fetch all group members to validate emails
  const groupMembers = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: true }
  });
  const validEmails = groupMembers.map(m => m.user.email);

  // 2. Create the Import Batch
  const batch = await prisma.importBatch.create({
    data: { groupId }
  });

  const rows = [];
  
  // 3. Parse CSV
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', async () => {
        try {
          // Clean up the temp file safely (Windows may lock it briefly)
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          console.warn('Failed to delete temp file immediately:', e.message);
        }

        try {
          // Fetch exchange rate helper
        const fetchExchangeRate = async (dateIso) => {
          try {
            const response = await axios.get(`https://api.frankfurter.app/${dateIso}?from=USD&to=INR`);
            return response.data.rates.INR;
          } catch (error) {
            throw error;
          }
        };

        const existingParsedRows = []; // To track duplicates within the batch

        // Process rows sequentially to track duplicates correctly
        const processedRows = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const { parsedData, anomalies } = await detectAnomalies(row, i, groupMembers, existingParsedRows, fetchExchangeRate);
          
          existingParsedRows.push(parsedData);

          processedRows.push({
            batchId: batch.id,
            rawRowData: row,
            parsedData: parsedData,
            anomalies: anomalies.length > 0 ? anomalies : null,
            status: anomalies.length > 0 ? 'PENDING' : 'RESOLVED'
          });
        }

        // Insert all rows into database
        await prisma.importRow.createMany({ data: processedRows });

        const hasPending = processedRows.some(r => r.status === 'PENDING');
        await prisma.importBatch.update({
          where: { id: batch.id },
          data: { status: hasPending ? 'NEEDS_REVIEW' : 'READY' }
        });

        resolve(batch.id);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', reject);
  });
}

export async function getBatchStatus(groupId, batchId) {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId, groupId },
    include: { rows: true }
  });
  if (!batch) throw new Error('Batch not found');
  return batch;
}

export async function resolveRow(batchId, rowId, actionTaken, updatedParsedData) {
  const row = await prisma.importRow.findUnique({ where: { id: rowId, batchId } });
  if (!row) throw new Error('Row not found');

  return prisma.importRow.update({
    where: { id: rowId },
    data: {
      status: actionTaken === 'SKIP' ? 'SKIPPED' : 'RESOLVED',
      actionTaken,
      parsedData: updatedParsedData ? updatedParsedData : row.parsedData
    }
  });
}

export async function commitBatch(groupId, batchId, userId) {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId, groupId },
    include: { rows: true }
  });

  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'PENDING') throw new Error(`Batch is already ${batch.status}`);

  const pendingRows = batch.rows.filter(r => r.status === 'PENDING');
  if (pendingRows.length > 0) {
    throw new Error('Cannot commit batch. There are still pending anomalies to resolve.');
  }

  // Fetch group members to map emails to userIds
  const groupMembers = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: true }
  });

  const resolvedRows = batch.rows.filter(r => r.status === 'RESOLVED');

  // Insert Expenses using a Transaction
  await prisma.$transaction(async (tx) => {
    for (const row of resolvedRows) {
      const { date, description, amount, currency, exchangeRate, payerEmail } = row.parsedData;
      
      const payer = groupMembers.find(m => m.user.email === payerEmail);
      if (!payer) throw new Error(`Data corruption: User ${payerEmail} not found at commit time`);

      const totalAmount = new Decimal(amount);
      const membersCount = groupMembers.length;
      // Dynamic Split Calculation
      let totalAssigned = new Decimal(0);
      const computedParticipants = [];
      const splitType = row.parsedData.splitType || 'EQUAL';
      const splitWithStr = row.parsedData.splitWith || '';
      const splitDetailsStr = row.parsedData.splitDetails || '';

      // Determine who is participating in this split
      let participantMembers = [];
      if (splitWithStr) {
        const emails = splitWithStr.split(',').map(s => s.trim().toLowerCase());
        participantMembers = groupMembers.filter(m => emails.includes(m.user.email.toLowerCase()));
      } else {
        // If no split_with provided, default to all current group members
        participantMembers = groupMembers;
      }
      
      const pCount = participantMembers.length;
      if (pCount === 0) throw new Error(`Row ${row.parsedData.rowNumber}: No valid participants found.`);

      if (splitType === 'EQUAL' || splitType === 'SHARE') {
        let shares = [];
        let totalShares = new Decimal(0);

        if (splitType === 'SHARE' && splitDetailsStr) {
          const parts = splitDetailsStr.split(';');
          participantMembers.forEach(m => {
            const match = parts.find(p => p.toLowerCase().includes(m.user.name.toLowerCase()) || p.toLowerCase().includes(m.user.email.toLowerCase()));
            const share = match ? new Decimal(match.match(/(\d+(?:\.\d+)?)/)[1]) : new Decimal(1);
            shares.push({ member: m, share });
            totalShares = totalShares.plus(share);
          });
        } else {
          participantMembers.forEach(m => {
            shares.push({ member: m, share: new Decimal(1) });
            totalShares = totalShares.plus(1);
          });
        }

        for (let i = 0; i < pCount; i++) {
          const { member, share } = shares[i];
          let amountOwed = totalAmount.times(share).dividedBy(totalShares).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
          
          if (i === pCount - 1) amountOwed = totalAmount.minus(totalAssigned);
          totalAssigned = totalAssigned.plus(amountOwed);

          computedParticipants.push({
            userId: member.userId,
            amountOwed: amountOwed,
            splitValue: splitType === 'SHARE' ? share : null
          });
        }
      } else if (splitType === 'PERCENTAGE') {
        const parts = splitDetailsStr.split(';');
        for (let i = 0; i < pCount; i++) {
          const m = participantMembers[i];
          const match = parts.find(p => p.toLowerCase().includes(m.user.name.toLowerCase()) || p.toLowerCase().includes(m.user.email.toLowerCase()));
          const pct = match ? new Decimal(match.match(/(\d+(?:\.\d+)?)/)[1]) : new Decimal(0);
          
          let amountOwed = totalAmount.times(pct).dividedBy(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
          if (i === pCount - 1 && totalAssigned.plus(amountOwed).lessThan(totalAmount)) {
             // Basic rounding adjustment
             amountOwed = totalAmount.minus(totalAssigned);
          }
          totalAssigned = totalAssigned.plus(amountOwed);

          computedParticipants.push({
            userId: m.userId,
            amountOwed: amountOwed,
            splitValue: pct
          });
        }
      } else if (splitType === 'UNEQUAL') {
        const parts = splitDetailsStr.split(';');
        for (let i = 0; i < pCount; i++) {
          const m = participantMembers[i];
          const match = parts.find(p => p.toLowerCase().includes(m.user.name.toLowerCase()) || p.toLowerCase().includes(m.user.email.toLowerCase()));
          const amountOwed = match ? new Decimal(match.match(/(\d+(?:\.\d+)?)/)[1]) : new Decimal(0);
          
          computedParticipants.push({
            userId: m.userId,
            amountOwed: amountOwed,
            splitValue: amountOwed
          });
        }
      }

      // Handle Settlement Rows (A-04 & A-16)
      if (row.anomalies && Array.isArray(row.anomalies) && row.anomalies.some(a => a.code === 'A-04_16')) {
         // If actionTaken was "Import as Settlement", we create a Settlement instead of Expense
         if (row.actionTaken === 'Import as Settlement') {
           const receiver = groupMembers.find(m => description.toLowerCase().includes(m.user.name.toLowerCase()) || description.toLowerCase().includes(m.user.email.toLowerCase()));
           if (receiver) {
             await tx.settlement.create({
               data: {
                 groupId, payerId: payer.userId, receiverId: receiver.userId,
                 amount: totalAmount, currency, date: new Date(date)
               }
             });
             continue; // Skip creating expense
           }
         }
      }

      await tx.expense.create({
        data: {
          groupId,
          description,
          amount: totalAmount,
          currency,
          exchangeRateToGroupCurrency: new Decimal(exchangeRate),
          expenseDate: new Date(date),
          paidById: payer.userId,
          splitType: splitType === 'SHARE' ? 'EQUAL' : splitType,
          participants: {
            create: computedParticipants
          }
        }
      });
    }

    // Mark batch as committed
    await tx.importBatch.update({
      where: { id: batchId },
      data: { status: 'COMMITTED' }
    });
  });

  return { message: 'Batch committed successfully', rowsImported: resolvedRows.length };
}
