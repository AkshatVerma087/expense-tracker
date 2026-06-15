# Decision Log

### Decision 1

Problem:
How should duplicate expenses be handled?

Options:
1. Delete automatically
2. Keep all
3. Flag for review

Chosen:
Flag for review

Reason:
Meera explicitly requested an approval workflow before any deletion or overriding occurs to maintain data integrity.

---

### Decision 2

Problem:
How should balances be simplified for display?

Options:
1. Show a raw ledger of every single granular debt.
2. Minimize transactions using a greedy algorithm.

Chosen:
Minimize transactions

Reason:
Aisha specifically stated she wants "one final number per person" to easily know who pays whom without doing mental math.

---

### Decision 3

Problem:
How to handle USD expenses when the group currency is INR?

Options:
1. Treat as INR and ignore the currency code.
2. Ignore the expense entirely.
3. Convert using the historical exchange rate for that exact date.

Chosen:
Convert using exchange rate

Reason:
Priya specifically requested currency correctness, noting that the spreadsheet previously pretended a dollar was a rupee. We query an external API for the historical rate.

---

### Decision 4

Problem:
Member joins or leaves the group mid-month.

Options:
1. Charge them for all expenses logged in the group history.
2. Delete them from the group entirely.
3. Implement a timeline model with `joinedAt` and `leftAt`.

Chosen:
Membership timeline model.

Reason:
Sam should not pay for March electricity or rent expenses since he moved in during mid-April. We strictly gate expense participation by checking if the expense date falls within the member's active window.
