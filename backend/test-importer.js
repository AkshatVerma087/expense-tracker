import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import fs from 'fs';
import FormData from 'form-data';
import axios from 'axios';

dotenv.config();
const prisma = new PrismaClient();

async function testImporter() {
  try {
    const group = await prisma.group.findFirst({
      include: { members: { include: { user: true } } }
    });

    if (!group) return console.log('No group found.');

    const payer = group.members[0].user;
    const friend = group.members[1]?.user;

    if (!friend) return console.log('Need at least 2 users in the group.');

    console.log(`Using Group: ${group.id}`);
    
    // Create a dummy CSV
    const csvContent = `Date,Description,Amount,Currency,Paid By
2023-10-01,Groceries,45.50,INR,${payer.email}
2023-10-02,Flight Ticket,100,USD,${payer.email}
2023-10-03,Mystery Expense,-10.00,INR,${payer.email}
2023-10-04,Missing Payer,50.00,INR,
2023-10-05,Unknown User,20.00,INR,fake@user.com
`;
    fs.writeFileSync('dummy_expenses.csv', csvContent);

    const token = jwt.sign({ userId: payer.id }, process.env.JWT_SECRET, { expiresIn: '15m' });

    // 1. Upload CSV
    console.log('\n--- UPLOADING CSV ---');
    const form = new FormData();
    form.append('file', fs.createReadStream('dummy_expenses.csv'));

    const res1 = await axios.post(`http://localhost:5000/api/groups/${group.id}/import/upload`, form, {
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form.getHeaders()
      }
    });
    
    const uploadData = res1.data;
    console.log(uploadData);
    const batchId = uploadData.batchId;

    if (!batchId) return console.log('Failed to upload');

    // 2. Wait a moment for async processing
    await new Promise(r => setTimeout(r, 2000));

    // 3. Get Batch Status
    console.log('\n--- BATCH STATUS (ANOMALIES DETECTED) ---');
    const res2 = await fetch(`http://localhost:5000/api/groups/${group.id}/import/batches/${batchId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const batchData = await res2.json();
    console.log(JSON.stringify(batchData, null, 2));

    // 4. Resolve Anomalies
    console.log('\n--- RESOLVING ANOMALIES ---');
    for (const row of batchData.batch.rows) {
      if (row.status === 'PENDING') {
        const anomalies = row.anomalies.map(a => a.type);
        if (anomalies.includes('NEGATIVE_AMOUNT') || anomalies.includes('MISSING_PAYER') || anomalies.includes('UNKNOWN_USER')) {
          console.log(`Skipping Row ${row.id} due to ${anomalies.join(', ')}`);
          await fetch(`http://localhost:5000/api/groups/${group.id}/import/batches/${batchId}/rows/${row.id}/resolve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ actionTaken: 'SKIP' })
          });
        }
      }
    }

    // 5. Commit Batch
    console.log('\n--- COMMITTING BATCH ---');
    const res3 = await fetch(`http://localhost:5000/api/groups/${group.id}/import/batches/${batchId}/commit`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const commitData = await res3.json();
    console.log(commitData);

    // Clean up
    fs.unlinkSync('dummy_expenses.csv');

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

testImporter();
