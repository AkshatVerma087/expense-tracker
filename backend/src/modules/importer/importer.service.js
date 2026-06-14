import pkg from '@prisma/client';
const { PrismaClient, Prisma } = pkg;
const { Decimal } = Prisma;
import fs from 'fs';
import csv from 'csv-parser';
import axios from 'axios';

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
        // Clean up the temp file
        fs.unlinkSync(filePath);

        // Process rows in parallel for exchange rate fetching
        const processedRows = await Promise.all(rows.map(async (row) => {
          const anomalies = [];
          
          // Map standard columns
          const date = row['Date'] || row['date'];
          const description = row['Description'] || row['description'];
          let amountStr = row['Amount'] || row['amount'];
          const currency = row['Currency'] || row['currency'] || 'USD';
          const payerEmail = row['Paid By'] || row['paid_by'];

          let amount;
          try {
            amount = new Decimal(amountStr);
            if (amount.isNegative()) {
              anomalies.push({ type: 'NEGATIVE_AMOUNT', message: `Amount is negative: ${amountStr}` });
            }
          } catch (e) {
            anomalies.push({ type: 'INVALID_AMOUNT', message: `Amount is invalid: ${amountStr}` });
          }

          if (!payerEmail) {
            anomalies.push({ type: 'MISSING_PAYER', message: 'Payer email is missing' });
          } else if (!validEmails.includes(payerEmail)) {
            anomalies.push({ type: 'UNKNOWN_USER', message: `User ${payerEmail} is not in the group` });
          }

          if (!date || isNaN(Date.parse(date))) {
            anomalies.push({ type: 'INVALID_DATE', message: `Invalid date: ${date}` });
          }

          // Currency Conversion (Priya's Rule)
          let exchangeRate = new Decimal(1.0);
          if (currency === 'USD' && date && !isNaN(Date.parse(date))) {
            try {
              // Format date to YYYY-MM-DD for Frankfurter API
              const isoDate = new Date(date).toISOString().split('T')[0];
              const response = await axios.get(`https://api.frankfurter.app/${isoDate}?from=USD&to=INR`);
              exchangeRate = new Decimal(response.data.rates.INR);
            } catch (error) {
              anomalies.push({ type: 'EXCHANGE_RATE_FAILED', message: `Failed to fetch INR exchange rate for USD on ${date}` });
            }
          } else if (currency !== 'INR' && currency !== 'USD') {
            anomalies.push({ type: 'UNKNOWN_CURRENCY', message: `Currency ${currency} is not natively supported without a manual rate` });
          }

          return {
            batchId: batch.id,
            rawRowData: row,
            parsedData: {
              date,
              description,
              amount: amount ? amount.toString() : null,
              currency,
              exchangeRate: exchangeRate.toString(),
              payerEmail
            },
            anomalies: anomalies.length > 0 ? anomalies : null,
            status: anomalies.length > 0 ? 'PENDING' : 'RESOLVED'
          };
        }));

        // Insert all rows into database
        await prisma.importRow.createMany({ data: processedRows });

        resolve(batch.id);
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
      const splitAmount = totalAmount.dividedBy(membersCount).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

      // We default imported expenses to EQUAL split amongst all current members.
      let totalAssigned = new Decimal(0);
      const computedParticipants = [];

      for (let i = 0; i < membersCount; i++) {
        let amountOwed = splitAmount;
        if (i === membersCount - 1) {
          amountOwed = totalAmount.minus(totalAssigned);
        }
        totalAssigned = totalAssigned.plus(amountOwed);
        
        computedParticipants.push({
          userId: groupMembers[i].userId,
          amountOwed: amountOwed,
          splitValue: null
        });
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
          splitType: 'EQUAL',
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
