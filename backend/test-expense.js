import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function testExpense() {
  try {
    // 1. Get the group created by the user
    const group = await prisma.group.findFirst({
      include: {
        members: true
      }
    });

    if (!group) {
      console.log('No groups found in the database. Please create one first.');
      return;
    }

    // 2. We need at least 2 members. Let's get them from the group.
    if (group.members.length < 2) {
      console.log('Adding a dummy user to the group for testing...');
      
      const dummyUser = await prisma.user.upsert({
        where: { email: 'dummy@test.com' },
        update: {},
        create: {
          email: 'dummy@test.com',
          name: 'Dummy Tester',
          passwordHash: 'dummyhash'
        }
      });

      await prisma.groupMember.create({
        data: {
          groupId: group.id,
          userId: dummyUser.id,
          role: 'MEMBER'
        }
      });

      // Reload group to get the new member
      group.members.push({ userId: dummyUser.id });
    }

    const payer = group.members[0].userId;
    const friend = group.members[1].userId;

    console.log(`Using Group: ${group.id}`);
    console.log(`Payer ID: ${payer}`);
    console.log(`Friend ID: ${friend}`);

    // 3. Generate a fake access token directly from the secret
    const token = jwt.sign({ userId: payer }, process.env.JWT_SECRET, { expiresIn: '15m' });

    // 4. Make an EQUAL split request using fetch
    console.log('\n--- TESTING EQUAL SPLIT ---');
    const res1 = await fetch(`http://localhost:5000/api/groups/${group.id}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        description: "Dinner at Mario's",
        amount: "100.00",
        currency: "USD",
        paidById: payer,
        splitType: "EQUAL",
        participants: [
          { userId: payer },
          { userId: friend }
        ]
      })
    });
    
    const data1 = await res1.json();
    console.log(JSON.stringify(data1, null, 2));

    // 5. Make a PERCENTAGE split request using fetch
    console.log('\n--- TESTING PERCENTAGE SPLIT ---');
    const res2 = await fetch(`http://localhost:5000/api/groups/${group.id}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        description: "Uber from Airport",
        amount: "50.00",
        currency: "USD",
        paidById: payer,
        splitType: "PERCENTAGE",
        participants: [
          { userId: payer, splitValue: "60" },
          { userId: friend, splitValue: "40" }
        ]
      })
    });

    const data2 = await res2.json();
    console.log(JSON.stringify(data2, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

testExpense();
