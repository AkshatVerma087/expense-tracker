import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

export const getDashboardMetrics = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all groups user is a member of
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: { group: true }
    });

    const groupsCount = memberships.length;

    // To calculate lifetime balances across all groups, we can query ExpenseParticipant
    // and compare with Expense.paidById.
    // However, the group balance calculation in balances.service.js handles this precisely
    // by including settlements. For a global dashboard, we can just run the balances
    // calculation for the user's groups in parallel, or aggregate directly.
    // To be perfectly accurate and match the group balances view, we can aggregate
    // the participant's shares vs paid amounts.

    let totalPaid = 0;
    let totalOwed = 0;

    // 1. Total Paid by User (sum of Expenses paid by user)
    const expensesPaid = await prisma.expense.aggregate({
      where: {
        paidById: userId,
        deletedAt: null,
      },
      _sum: {
        amount: true
      }
    });

    // We must multiply by exchangeRateToGroupCurrency if we want normalized values,
    // but the app doesn't currently normalize across different group currencies globally.
    // For simplicity (assuming mostly INR), we just sum the amounts.
    // A more precise approach:
    const allExpensesPaid = await prisma.expense.findMany({
      where: { paidById: userId, deletedAt: null }
    });
    for (const exp of allExpensesPaid) {
      totalPaid += parseFloat(exp.amount) * parseFloat(exp.exchangeRateToGroupCurrency);
    }

    // 2. Total Owed by User (sum of ExpenseParticipant shares for user)
    const participations = await prisma.expenseParticipant.findMany({
      where: { userId, expense: { deletedAt: null } },
      include: { expense: true }
    });
    for (const p of participations) {
      totalOwed += parseFloat(p.amountOwed) * parseFloat(p.expense.exchangeRateToGroupCurrency);
    }

    // 3. Settlements Paid By User (increases totalPaid effectively, or reduces totalOwed)
    const settlementsPaid = await prisma.settlement.findMany({
      where: { payerId: userId, deletedAt: null }
    });
    for (const s of settlementsPaid) {
      totalPaid += parseFloat(s.amount);
    }

    // 4. Settlements Received By User (increases totalOwed effectively, or reduces totalPaid)
    const settlementsReceived = await prisma.settlement.findMany({
      where: { receiverId: userId, deletedAt: null }
    });
    for (const s of settlementsReceived) {
      totalOwed += parseFloat(s.amount);
    }

    const netBalance = totalPaid - totalOwed;

    res.json({
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      totalOwed: parseFloat(totalOwed.toFixed(2)),
      netBalance: parseFloat(netBalance.toFixed(2)),
      groupsCount
    });

  } catch (error) {
    console.error("Error fetching dashboard metrics:", error);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
};
