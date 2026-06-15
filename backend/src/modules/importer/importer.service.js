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
        const inMemoryRateCache = {};
        
        // Cache-aware exchange rate helper
        const fetchExchangeRate = async (dateIso) => {
          if (inMemoryRateCache[dateIso]) return inMemoryRateCache[dateIso];
          
          try {
            // Check cache first
            const cached = await prisma.exchangeRateCache.findUnique({
              where: { date_fromCurrency_toCurrency: { date: dateIso, fromCurrency: 'USD', toCurrency: 'INR' } }
            });
            if (cached) {
              const rate = parseFloat(cached.rate.toString());
              inMemoryRateCache[dateIso] = rate;
              return rate;
            }

            // Fetch from API
            const response = await axios.get(`https://api.frankfurter.app/${dateIso}?from=USD&to=INR`);
            const rate = response.data.rates.INR;

            // Cache the result
            await prisma.exchangeRateCache.upsert({
              where: { date_fromCurrency_toCurrency: { date: dateIso, fromCurrency: 'USD', toCurrency: 'INR' } },
              update: { rate },
              create: { date: dateIso, fromCurrency: 'USD', toCurrency: 'INR', rate, source: 'frankfurter' }
            });

            inMemoryRateCache[dateIso] = rate;
            return rate;
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
  if (batch.status === 'COMMITTED') throw new Error(`Batch is already COMMITTED`);
  if (batch.status === 'FAILED') throw new Error(`Batch is FAILED`);

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

  const operations = [];
  const crypto = await import('crypto');

  for (const row of resolvedRows) {
    const { date, description, amount, currency, exchangeRate, payerEmail } = row.parsedData;
    
    const payer = groupMembers.find(m => m.user.email === payerEmail);
    if (!payer) throw new Error(`Data corruption: User ${payerEmail} not found at commit time`);

    const cleanAmount = String(amount || '0').replace(/,/g, '');
    const totalAmount = new Decimal(cleanAmount || '0');
    const membersCount = groupMembers.length;
    let totalAssigned = new Decimal(0);
    const computedParticipants = [];
    const splitType = row.parsedData.splitType || 'EQUAL';
    const splitWithStr = row.parsedData.splitWith || '';
    const splitDetailsStr = row.parsedData.splitDetails || '';

    let participantMembers = [];
    let unknownSharesToAbsorb = new Decimal(0);
    
    let parsedDateString = date;
    if (parsedDateString && !parsedDateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parts = parsedDateString.split(/[-/.]/);
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          parsedDateString = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
    }
    
    const expenseDate = new Date(parsedDateString);

    const isOutOfBounds = (m) => {
      if (m.joinedAt && expenseDate < new Date(m.joinedAt)) return true;
      if (m.leftAt && expenseDate > new Date(m.leftAt)) return true;
      return false;
    };

    if (splitWithStr) {
      const identifiers = splitWithStr.split(/[;,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
      identifiers.forEach(identifier => {
        const member = groupMembers.find(m => m.user.email.toLowerCase() === identifier || m.user.name.toLowerCase() === identifier);
        if (member && !isOutOfBounds(member)) {
          participantMembers.push(member);
        } else {
          let share = new Decimal(1);
          if (splitType === 'SHARE' && splitDetailsStr) {
            const parts = splitDetailsStr.split(';');
            const match = parts.find(p => p.toLowerCase().includes(identifier));
            if (match) {
              const sMatch = match.match(/(\d+(?:\.\d+)?)/);
              if (sMatch) share = new Decimal(sMatch[1]);
            }
          }
          unknownSharesToAbsorb = unknownSharesToAbsorb.plus(share);
        }
      });
    } else {
      participantMembers = groupMembers.filter(m => !isOutOfBounds(m));
    }
    
    let pCount = participantMembers.length;
    if (pCount === 0 && unknownSharesToAbsorb.isZero()) throw new Error(`Row ${row.parsedData.rowNumber}: No valid participants found.`);

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

      if (unknownSharesToAbsorb.greaterThan(0)) {
         const payerShare = shares.find(s => s.member.userId === payer.userId);
         if (payerShare) {
           payerShare.share = payerShare.share.plus(unknownSharesToAbsorb);
           totalShares = totalShares.plus(unknownSharesToAbsorb);
         } else {
           shares.push({ member: payer, share: unknownSharesToAbsorb });
           totalShares = totalShares.plus(unknownSharesToAbsorb);
           participantMembers.push(payer);
           pCount++;
         }
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
        const amountOwed = match ? new Decimal(match.match(/([\d,]+(?:\.\d+)?)/)[1].replace(/,/g, '')) : new Decimal(0);
        
        computedParticipants.push({
          userId: m.userId,
          amountOwed: amountOwed,
          splitValue: amountOwed
        });
      }
    }

    if (row.anomalies && Array.isArray(row.anomalies) && row.anomalies.some(a => a.code === 'A-04_16')) {
       if (row.actionTaken === 'Import as Settlement') {
         const receiver = groupMembers.find(m => description.toLowerCase().includes(m.user.name.toLowerCase()) || description.toLowerCase().includes(m.user.email.toLowerCase()));
         if (receiver) {
           const settlementId = crypto.randomUUID();
           operations.push(prisma.settlement.create({
             data: {
               id: settlementId,
               groupId, payerId: payer.userId, receiverId: receiver.userId,
               amount: totalAmount, currency, date: new Date(date),
               importBatchId: batchId,
               notes: `Imported from CSV batch ${batchId}`
             }
           }));
           operations.push(prisma.auditLog.create({
             data: { userId, action: 'SETTLEMENT_CREATED', entityType: 'Settlement', entityId: settlementId,
               metadata: { source: 'csv_import', batchId, rowId: row.id } }
           }));
           continue;
         }
       }
    }

    const isUSD = (currency || '').toUpperCase() === 'USD';
    const expenseId = crypto.randomUUID();
    operations.push(prisma.expense.create({
      data: {
        id: expenseId,
        groupId,
        description,
        amount: totalAmount,
        currency: isUSD ? 'INR' : currency,
        originalCurrency: currency,
        originalAmount: isUSD ? totalAmount : null,
        exchangeRateToGroupCurrency: new Decimal(exchangeRate),
        exchangeRateSource: isUSD ? 'frankfurter' : null,
        exchangeRateDate: isUSD ? expenseDate : null,
        expenseDate: expenseDate,
        paidById: payer.userId,
        splitType: splitType === 'SHARE' ? 'EQUAL' : splitType,
        importBatchId: batchId,
        notes: row.parsedData.notes || null,
        category: row.parsedData.category || null,
        participants: {
          create: computedParticipants
        }
      }
    }));

    operations.push(prisma.auditLog.create({
      data: { userId, action: 'EXPENSE_CREATED', entityType: 'Expense', entityId: expenseId,
        metadata: { source: 'csv_import', batchId, rowId: row.id, originalCurrency: currency } }
    }));
  }

  const totalAnomalies = batch.rows.reduce((sum, r) => {
    if (r.anomalies && Array.isArray(r.anomalies)) return sum + r.anomalies.length;
    return sum;
  }, 0);

  operations.push(prisma.importBatch.update({
    where: { id: batchId },
    data: { status: 'COMMITTED', totalRows: batch.rows.length, anomalyCount: totalAnomalies, committedBy: userId }
  }));

  operations.push(prisma.auditLog.create({
    data: { userId, action: 'BATCH_COMMITTED', entityType: 'ImportBatch', entityId: batchId,
      metadata: { rowsImported: resolvedRows.length, totalRows: batch.rows.length } }
  }));

  await prisma.$transaction(operations);

  return { message: 'Batch committed successfully', rowsImported: resolvedRows.length };
}
