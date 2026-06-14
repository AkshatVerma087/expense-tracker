import pkg from '@prisma/client';
const { PrismaClient, Prisma } = pkg;
const { Decimal } = Prisma;

const prisma = new PrismaClient();

export async function getGroupBalances(groupId, userId) {
  // 1. Verify user is in the group
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } }
  });
  if (!membership || membership.leftAt) {
    throw new Error('You do not have permission to view this group');
  }

  // 2. Fetch all group members (historical and active)
  const groupMembers = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: { select: { id: true, name: true, email: true } } }
  });

  const balances = {};
  groupMembers.forEach(m => {
    balances[m.userId] = {
      user: m.user,
      totalPaid: new Decimal(0),
      totalOwed: new Decimal(0),
      netBalance: new Decimal(0)
    };
  });

  // 3. Fetch all expenses and apply them to balances
  // We only count amountOwed if the expense date is within their membership window (Sam's Rule)
  const expenses = await prisma.expense.findMany({
    where: { groupId, deletedAt: null },
    include: { participants: true }
  });

  expenses.forEach(exp => {
    // Add to totalPaid for the payer
    if (balances[exp.paidById]) {
      balances[exp.paidById].totalPaid = balances[exp.paidById].totalPaid.plus(exp.amount);
      balances[exp.paidById].netBalance = balances[exp.paidById].netBalance.plus(exp.amount);
    }

    // Add to totalOwed for participants (gated by membership dates)
    exp.participants.forEach(p => {
      const member = groupMembers.find(m => m.userId === p.userId);
      if (member) {
        // Date gate check: expenseDate must be >= joinedAt and <= leftAt (if leftAt exists)
        const eDate = new Date(exp.expenseDate).getTime();
        const jDate = new Date(member.joinedAt).getTime();
        const lDate = member.leftAt ? new Date(member.leftAt).getTime() : Infinity;

        if (eDate >= jDate && eDate <= lDate) {
          balances[p.userId].totalOwed = balances[p.userId].totalOwed.plus(p.amountOwed);
          balances[p.userId].netBalance = balances[p.userId].netBalance.minus(p.amountOwed);
        }
      }
    });
  });

  // 4. Fetch all settlements and apply them
  const settlements = await prisma.settlement.findMany({
    where: { groupId, deletedAt: null }
  });

  settlements.forEach(s => {
    // Payer sent money, so their net balance goes UP (they are owed more / owe less)
    if (balances[s.payerId]) {
      balances[s.payerId].netBalance = balances[s.payerId].netBalance.plus(s.amount);
    }
    // Receiver got money, so their net balance goes DOWN (they are owed less / owe more)
    if (balances[s.receiverId]) {
      balances[s.receiverId].netBalance = balances[s.receiverId].netBalance.minus(s.amount);
    }
  });

  // 5. Run Greedy Algorithm to calculate Minimum Settlement Transactions
  let debtors = [];
  let creditors = [];

  Object.values(balances).forEach(b => {
    if (b.netBalance.isNegative()) {
      debtors.push({ user: b.user, amount: b.netBalance.abs() });
    } else if (b.netBalance.isPositive()) {
      creditors.push({ user: b.user, amount: b.netBalance });
    }
  });

  // Sort descending by amount
  debtors.sort((a, b) => b.amount.comparedTo(a.amount));
  creditors.sort((a, b) => b.amount.comparedTo(a.amount));

  const suggestedSettlements = [];
  let i = 0; // debtors index
  let j = 0; // creditors index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const settleAmount = Decimal.min(debtor.amount, creditor.amount);

    suggestedSettlements.push({
      fromUser: debtor.user,
      toUser: creditor.user,
      amount: settleAmount.toDecimalPlaces(4).toString()
    });

    debtor.amount = debtor.amount.minus(settleAmount);
    creditor.amount = creditor.amount.minus(settleAmount);

    if (debtor.amount.isZero()) i++;
    if (creditor.amount.isZero()) j++;
  }

  // Format outputs
  const formattedBalances = Object.values(balances).map(b => ({
    user: b.user,
    totalPaid: b.totalPaid.toDecimalPlaces(4).toString(),
    totalOwed: b.totalOwed.toDecimalPlaces(4).toString(),
    netBalance: b.netBalance.toDecimalPlaces(4).toString()
  }));

  return {
    memberBalances: formattedBalances,
    suggestedSettlements
  };
}
