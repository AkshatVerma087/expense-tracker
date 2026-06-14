import pkg from '@prisma/client';
const { PrismaClient, Prisma } = pkg;
const { Decimal } = Prisma;

const prisma = new PrismaClient();

export async function recordSettlement(groupId, payerId, receiverId, amount, currency = 'USD', date) {
  // 1. Verify payer is in the group
  const payerMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: payerId } }
  });
  if (!payerMembership || payerMembership.leftAt) {
    throw new Error('Payer is not an active member of this group');
  }

  // 2. Verify receiver is in the group
  const receiverMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: receiverId } }
  });
  if (!receiverMembership) {
    throw new Error('Receiver is not a member of this group');
  }

  const settleAmount = new Decimal(amount);
  if (settleAmount.lte(0)) {
    throw new Error('Settlement amount must be greater than zero');
  }

  // 3. Create Settlement Record
  const settlement = await prisma.settlement.create({
    data: {
      groupId,
      payerId,
      receiverId,
      amount: settleAmount,
      currency,
      date: date ? new Date(date) : new Date()
    }
  });

  return settlement;
}

export async function getGroupSettlements(groupId, userId) {
  // Verify user is in the group
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } }
  });
  if (!membership || membership.leftAt) {
    throw new Error('You do not have permission to view this group');
  }

  return prisma.settlement.findMany({
    where: { groupId, deletedAt: null },
    include: {
      payer: { select: { id: true, name: true } },
      receiver: { select: { id: true, name: true } }
    },
    orderBy: { date: 'desc' }
  });
}
