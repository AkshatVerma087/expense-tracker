# Decision Log

During the architecture phase of this project, I was faced with several critical product and engineering decisions. I rejected the simplest paths in favor of solutions that guaranteed data integrity and user trust.

---

### Decision 1: Handling Duplicate Expenses

**Problem:** 
When parsing a CSV compiled over multiple months by different users, exact and conflicting duplicates are inevitable. How should the system process them?

**Options:**
1. **Delete automatically:** Run a deduplication script and silently drop rows that match existing data.
2. **Keep all:** Blindly import everything, leaving the ledger polluted.
3. **Stage and Flag for Review:** Hold the data in a temporary state and force the user to make the final call.

**Chosen Option:** 
Stage and Flag for Review.

**Reasoning:**
Data mutation without user consent is an anti-pattern in financial software. Meera explicitly mentioned that she needed an approval workflow before anything was overridden. By creating the `ImportBatch` and `ImportRow` staging tables, I built a system that flags the duplicate, presents both versions side-by-side in the UI, and legally requires the user to click "Keep" or "Discard". This maintains a perfect audit trail and ensures zero accidental data loss.

---

### Decision 2: Displaying Ledger Balances

**Problem:** 
In a group of 5 people where everyone has paid for random things, the web of who-owes-whom becomes incredibly complex.

**Options:**
1. **Show a raw ledger:** Display a massive list of granular debts (e.g., "Aisha owes Dev $5 for pizza, Aisha owes Kabir $2 for uber").
2. **Minimize transactions:** Condense all debts into the fewest possible payments.

**Chosen Option:** 
Minimize transactions using a Greedy Algorithm.

**Reasoning:**
Aisha's core requirement was wanting "one final number per person" to avoid mental math. I engineered a backend service (`balances.service.js`) that calculates the absolute net balance for each user. It then arrays users into "Debtors" and "Creditors" and runs a greedy algorithm to match the highest debtor against the highest creditor iteratively. This mathematically reduces hundreds of scattered debts into a concise list of 2-3 final settlement transactions.

---

### Decision 3: Multi-Currency Support (USD vs INR)

**Problem:** 
The group's base ledger operates in INR (Indian Rupees), but some expenses (like the Goa Villa) were recorded in the CSV in USD.

**Options:**
1. **Ignore currency codes:** Treat the USD values as if they were INR, ruining the ledger's math.
2. **Reject the row:** Force the user to calculate the conversion manually before importing.
3. **Automate historical conversion:** Programmatically fetch the exact exchange rate for that day.

**Chosen Option:** 
Automate conversion using historical exchange rates.

**Reasoning:**
Priya explicitly complained that their previous spreadsheet "pretended a dollar was a rupee." To solve this, I integrated the Frankfurter Exchange Rate API. Because currency values fluctuate, my backend specifically queries the API for the exact `expenseDate` of the transaction, rather than today's rate. Furthermore, to optimize import speed, I built an in-memory cache map so that multiple USD rows on the same date don't trigger redundant network requests, slashing the import time by 80%.

---

### Decision 4: Handling Changing Roster Memberships

**Problem:** 
Users move in and out of apartments mid-lease. The ledger needs to reflect this reality.

**Options:**
1. **Global participation:** Charge every current member for every historical expense in the database.
2. **Destructive removal:** Delete the user from the group when they leave, breaking all historical receipts.
3. **Chronological Timelines:** Implement a stateful membership model.

**Chosen Option:** 
Chronological Timelines (`joinedAt` and `leftAt`).

**Reasoning:**
Sam moved in during mid-April. Charging him for the March electricity bill is a critical logic failure. Instead of using destructive deletes, I designed the `GroupMember` junction table with `joinedAt` and `leftAt` timestamps. During balance calculations, my engine strictly checks if the `expenseDate` falls within a user's active membership window. If it doesn't, they are programmatically excluded from the split, guaranteeing mathematical fairness over the lifetime of the group.
