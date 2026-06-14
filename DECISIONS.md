# DECISIONS.md — Product & Technical Decision Log
## Spreetail Shared Expenses App

This document records every significant decision made during design and implementation, the alternatives considered, and the rationale for the choice made.

---

## Product Decisions

### PD-01: Staged Import (not immediate write)
- **Decision:** Import creates an `ImportBatch` with all parsed rows and anomalies staged in JSONB. No data is written to the DB until the user explicitly reviews and commits.
- **Rationale:** Meera's explicit requirement: "I want to approve anything the app deletes or changes." The CSV has 18 anomalies. Silently committing bad data is a failing implementation.
- **Alternative Considered:** Write rows immediately; flag bad ones for later correction. Simpler, but fails Meera's approval requirement and risks permanent bad data.
- **Tradeoff:** More complex import flow (6 phases vs. 2). Worth it for data integrity and the auditability requirement.

### PD-02: Soft Delete Only — No Hard Deletes
- **Decision:** No hard deletes anywhere in the system. Every table uses `status` or `deleted_at`.
- **Rationale:** Meera's "approve before delete" requirement. Audit trail is impossible with hard deletes.
- **Alternative:** Hard delete with audit log insert before deletion.
- **Tradeoff:** Queries must always filter `WHERE status != 'DELETED'` or `WHERE deleted_at IS NULL`. Small performance cost; large integrity gain.

### PD-03: Historical Exchange Rates Per Expense
- **Decision:** Fetch exchange rate for each USD expense using the expense's actual date. Store rate in `expenses.exchange_rate`. Cache in `exchange_rates` table.
- **Rationale:** Priya's requirement: "The sheet pretends a dollar is a rupee." All 4 USD expenses are on different dates with different rates.
- **Alternative:** Use single import-time rate for all USD expenses.
- **Tradeoff:** Requires external API call during import. Rate stored for reproducibility — same batch always produces same result.

### PD-04: Membership Date Gates Balance Calculation
- **Decision:** A member's share of an expense is only counted if the expense date falls within their `[joined_at, left_at]` window.
- **Rationale:** Sam's requirement: "I moved in mid-April. Why would March electricity affect me?"
- **Alternative:** Only gate future expenses after the feature is built; allow retroactive charge.
- **Tradeoff:** More complex balance query. Required for correctness. Non-negotiable.

### PD-05: Minimum Transactions for Settlement Display
- **Decision:** Balance summary shows the minimum number of payments needed to settle all debts using a greedy algorithm on net balances.
- **Rationale:** Aisha wants "one number per person. Who pays whom, done."
- **Alternative:** Show full pairwise debt matrix (A owes B ₹X, B owes C ₹Y, etc.).
- **Tradeoff:** Minimum transactions may not match who literally owes whom in the original expense records, but it's mathematically equivalent and dramatically simpler. Show both views.

### PD-06: Settlements Imported Separately from Expenses
- **Decision:** "Rohan paid Aisha back" (Row 13) and "Sam deposit share" (Row 37) are imported as `Settlement` records, not `Expense` records.
- **Rationale:** They have no split — they are money transfers. Treating them as expenses creates phantom balances (participants appear to owe money they don't).
- **Detection Logic:** `split_type IS NULL` AND description matches payment/deposit patterns.

### PD-07: Non-Member Guest Share Merged Into Host
- **Decision:** Dev's friend Kabir (not a group member) has his parasailing share merged into Dev's share.
- **Rationale:** Cannot create expense participants for non-members. The host (Dev) brought the guest and is responsible.
- **Alternative:** Skip Kabir's share (creates a ₹30 imbalance). Reject the row entirely.
- **Tradeoff:** Dev's share increases. Logged clearly in anomaly. User must approve.

---

## Technical Decisions

### TD-01: Prisma ORM over Raw SQL
- **Decision:** Prisma with NeonDB PostgreSQL.
- **Rationale:** Type-safe queries, schema-as-code, migration tooling, built-in `Decimal` type for money.
- **Alternative:** Raw SQL via `pg` library (more control, no abstraction overhead).
- **Tradeoff:** Prisma hides some SQL nuance. For complex balance queries, we may drop to raw SQL via `prisma.$queryRaw`. Acceptable tradeoff at this scale.

### TD-02: `NUMERIC(15,4)` for All Money — Never Float
- **Decision:** All monetary amounts stored as `NUMERIC(15,4)`. Use `decimal.js` in TypeScript for arithmetic.
- **Rationale:** IEEE 754 floats are non-associative. ₹899.995 / 4 gives different results in different environments. Balance drift is unacceptable.
- **Alternative:** Store as integers (paise). Requires multiplying all display values.
- **Tradeoff:** Slightly more storage. Zero arithmetic drift. Non-negotiable.

### TD-03: JSONB for Import Staging
- **Decision:** Store all 42 parsed rows as JSONB in `import_batches.staged_data`.
- **Rationale:** We need to hold the entire parsed spreadsheet in staging without creating 42 rows in a separate `staged_rows` table.
- **Alternative:** Create a `staged_expense_rows` table with one row per staged expense.
- **Tradeoff:** JSONB loses type safety and indexability for individual rows. Acceptable because staged data is only ever queried by batch ID, not across batches.

### TD-04: Separate Frontend + Backend (not Next.js)
- **Decision:** React (Vite) on Vercel; Express on Render; NeonDB PostgreSQL.
- **Rationale:** Per the tech stack constraint. Allows independent scaling and deployment.
- **Tradeoff:** Two repos, two deploys, CORS configuration required. Standard for this stack.

### TD-05: JWT with Refresh Token (not Session)
- **Decision:** Short-lived access token (15 min, in React memory) + long-lived refresh token (7 days, httpOnly cookie). Token hash stored in `refresh_tokens` table for revocability.
- **Rationale:** Security best practice. Access token in memory prevents XSS theft. httpOnly cookie prevents JavaScript access to refresh token.
- **Alternative:** Session-based auth with server-side session store.
- **Tradeoff:** More implementation complexity. Required for production-quality security.

### TD-06: Rounding Policy — ROUND_HALF_UP
- **Decision:** When rounding is required (e.g., ₹899.995 → ₹900.00), use ROUND_HALF_UP (standard commercial rounding). Round at the split calculation step, not at the display step.
- **Rationale:** Consistent, predictable, matches user expectations. "Half up" means ₹0.005 rounds to ₹0.01, not ₹0.00.
- **Alternative:** ROUND_HALF_EVEN (banker's rounding — statistically unbiased). More accurate but less intuitive for users.
- **Penny Distribution:** When EQUAL split produces rounding remainder, assign extra penny to the first participant alphabetically. Log the distribution.

### TD-07: Exchange Rate API — Frankfurter.app
- **Decision:** Use `api.frankfurter.app` for historical exchange rates.
- **Rationale:** Free, no API key required, supports historical dates, returns standard ISO currency codes.
- **Alternative:** Open Exchange Rates (paid), fixer.io (paid), ECB data (manual download).
- **Fallback:** If API unavailable, check `exchange_rates` cache table. If no cached rate exists for that date, prompt user for manual entry. Import is blocked until rate is resolved.

---

## Data Policy Decisions

### DP-01: Date Ambiguity Resolution Policy
- **Unambiguous (day > 12):** Day cannot be a month. Auto-correct to DD/MM/YYYY. Show to user.
- **Ambiguous (day ≤ 12, month ≤ 12):** Flag as A-15. Block. Require explicit user selection. No default guess.
- **Rationale:** Guessing wrong date affects Sam's membership gate and Meera's departure gate.

### DP-02: Conflicting Duplicate Policy
- **Policy:** BLOCK both rows (A-03). Never auto-resolve conflicting duplicates.
- **Rationale:** Two entries for Thalassa dinner with different payers and amounts cannot both be correct. Neither can be assumed correct. Only the user knows which is real.

### DP-03: Missing Payer Policy
- **Policy:** BLOCK (A-07). Cannot import an expense with no payer. Balance is uncalculable.
- **Alternative:** Import with NULL payer, calculate as "group expense" with equal shares but no creditor.
- **Rejection Reason:** Creates a permanent balance hole. Better to block and require resolution.

### DP-04: Sub-Paise Rounding Policy
- **Policy:** Auto-round to 2 decimal places (ROUND_HALF_UP). Notify user. No approval required.
- **Rationale:** ₹899.995 → ₹900.00 is a ₹0.005 difference. Not worth blocking import for.
