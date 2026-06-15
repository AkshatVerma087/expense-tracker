import pkg from '@prisma/client';
const { PrismaClient, Prisma } = pkg;
const { Decimal } = Prisma;

const prisma = new PrismaClient();

/**
 * Split Engine Logic Helper
 */
function computeSplits(amount, participants, splitType) {
  const totalAmount = new Decimal(amount);
  let computedParticipants = [];

  if (splitType === 'EQUAL') {
    const splitAmount = totalAmount.dividedBy(participants.length).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
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

  return computedParticipants;
}

export async function createExpense(userId, groupId, data) {
  const { description, amount, currency, expenseDate, paidById, splitType, participants } = data;

  const requesterMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } }
  });
  if (!requesterMembership || requesterMembership.leftAt) {
    throw new Error('You are not an active member of this group');
  }

  const computedParticipants = computeSplits(amount, participants, splitType);

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        groupId,
        description,
        amount: new Decimal(amount),
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

export async function updateExpense(userId, groupId, expenseId, data) {
  const { description, amount, currency, expenseDate, paidById, splitType, participants } = data;

  const requesterMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } }
  });
  if (!requesterMembership || requesterMembership.leftAt) {
    throw new Error('You are not an active member of this group');
  }

  const computedParticipants = computeSplits(amount, participants, splitType);

  return prisma.$transaction(async (tx) => {
    await tx.expenseParticipant.deleteMany({ where: { expenseId } });

    const expense = await tx.expense.update({
      where: { id: expenseId },
      data: {
        description,
        amount: new Decimal(amount),
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

export async function deleteExpense(userId, groupId, expenseId) {
  const requesterMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } }
  });
  if (!requesterMembership || requesterMembership.leftAt) {
    throw new Error('You are not an active member of this group');
  }

  const expense = await prisma.expense.findUnique({
    where: { id: expenseId }
  });
  if (!expense || expense.groupId !== groupId || expense.deletedAt) {
    throw new Error('Expense not found');
  }

  return prisma.expense.update({
    where: { id: expenseId },
    data: { deletedAt: new Date() }
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
