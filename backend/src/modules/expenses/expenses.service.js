import pkg from '@prisma/client';
const { PrismaClient, Prisma } = pkg;
const { Decimal } = Prisma;

const prisma = new PrismaClient();

/**
 * Split Engine Logic
 */
export async function createExpense(userId, groupId, data) {
  const { description, amount, currency, expenseDate, paidById, splitType, participants } = data;

  // 1. Verify user is in the group and the payer is in the group
  const requesterMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } }
  });
  if (!requesterMembership || requesterMembership.leftAt) {
    throw new Error('You are not an active member of this group');
  }

  // 2. Prepare the Split Engine
  const totalAmount = new Decimal(amount);
  let computedParticipants = [];

  if (splitType === 'EQUAL') {
    // Split evenly among all given participants
    const splitAmount = totalAmount.dividedBy(participants.length).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    
    // Handle the remainder (e.g., 100 / 3 = 33.3333, remainder goes to first person)
    let totalAssigned = new Decimal(0);
    for (let i = 0; i < participants.length; i++) {
      let amountOwed = splitAmount;
      if (i === participants.length - 1) {
        amountOwed = totalAmount.minus(totalAssigned);
      }
      totalAssigned = totalAssigned.plus(amountOwed);
      
      computedParticipants.push({
        userId: participants[i].userId,
        amountOwed: amountOwed,
        splitValue: null
      });
    }

  } else if (splitType === 'UNEQUAL') {
    // Participants specify exactly what they owe
    let sum = new Decimal(0);
    for (const p of participants) {
      const owed = new Decimal(p.splitValue);
      sum = sum.plus(owed);
      computedParticipants.push({
        userId: p.userId,
        amountOwed: owed,
        splitValue: owed
      });
    }
    if (!sum.equals(totalAmount)) {
      throw new Error(`Unequal splits sum (${sum}) must equal the total amount (${totalAmount})`);
    }

  } else if (splitType === 'PERCENTAGE') {
    // Participants specify % share
    let sumPercent = new Decimal(0);
    let totalAssigned = new Decimal(0);
    
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const percent = new Decimal(p.splitValue);
      sumPercent = sumPercent.plus(percent);
      
      let amountOwed = totalAmount.times(percent).dividedBy(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      
      if (i === participants.length - 1) {
        amountOwed = totalAmount.minus(totalAssigned);
      }
      totalAssigned = totalAssigned.plus(amountOwed);

      computedParticipants.push({
        userId: p.userId,
        amountOwed: amountOwed,
        splitValue: percent
      });
    }

    if (!sumPercent.equals(100)) {
      throw new Error(`Percentages must sum to exactly 100%, got ${sumPercent}%`);
    }

  } else if (splitType === 'SHARE') {
    // Participants specify number of shares
    let totalShares = new Decimal(0);
    for (const p of participants) {
      totalShares = totalShares.plus(new Decimal(p.splitValue));
    }

    let totalAssigned = new Decimal(0);
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const shares = new Decimal(p.splitValue);
      
      let amountOwed = totalAmount.times(shares).dividedBy(totalShares).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      
      if (i === participants.length - 1) {
        amountOwed = totalAmount.minus(totalAssigned);
      }
      totalAssigned = totalAssigned.plus(amountOwed);

      computedParticipants.push({
        userId: p.userId,
        amountOwed: amountOwed,
        splitValue: shares
      });
    }
  } else {
    throw new Error('Invalid split type. Must be EQUAL, UNEQUAL, PERCENTAGE, or SHARE');
  }

  // 3. Write to DB within a transaction
  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        groupId,
        description,
        amount: totalAmount,
        currency,
        expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
        paidById,
        splitType,
        participants: {
          create: computedParticipants.map(p => ({
            userId: p.userId,
            amountOwed: p.amountOwed,
            splitValue: p.splitValue
          }))
        }
      },
      include: {
        participants: true
      }
    });
    return expense;
  });
}

export async function getGroupExpenses(groupId, userId) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } }
  });
  if (!membership || membership.leftAt) {
    throw new Error('You do not have permission to view this group');
  }

  return prisma.expense.findMany({
    where: {
      groupId: groupId,
      deletedAt: null // Exclude soft-deleted
    },
    include: {
      paidBy: { select: { id: true, name: true } },
      participants: {
        include: { user: { select: { id: true, name: true } } }
      }
    },
    orderBy: { expenseDate: 'desc' }
  });
}
