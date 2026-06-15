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

    const [
      [paidResult],
      [owedResult],
      settlementsPaidAgg,
      settlementsReceivedAgg
    ] = await Promise.all([
      prisma.$queryRaw`
        SELECT COALESCE(SUM(amount * "exchangeRateToGroupCurrency"), 0) as "totalPaid"
        FROM "Expense"
        WHERE "paidById" = ${userId} AND "deletedAt" IS NULL
      `,
      prisma.$queryRaw`
        SELECT COALESCE(SUM(ep."amountOwed" * e."exchangeRateToGroupCurrency"), 0) as "totalOwed"
        FROM "ExpenseParticipant" ep
        JOIN "Expense" e ON ep."expenseId" = e.id
        WHERE ep."userId" = ${userId} AND e."deletedAt" IS NULL
      `,
      prisma.settlement.aggregate({
        where: { payerId: userId, deletedAt: null },
        _sum: { amount: true }
      }),
      prisma.settlement.aggregate({
        where: { receiverId: userId, deletedAt: null },
        _sum: { amount: true }
      })
    ]);

    let totalPaid = Number(paidResult.totalPaid || 0);
    let totalOwed = Number(owedResult.totalOwed || 0);

    totalPaid += Number(settlementsPaidAgg._sum.amount || 0);
    totalOwed += Number(settlementsReceivedAgg._sum.amount || 0);

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
