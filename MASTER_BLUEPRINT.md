# MASTER BLUEPRINT — Complete Engineering Plan
## Spreetail Shared Expenses App

---

## 1. Requirement Analysis

### Explicit Requirements (from assignment)
1. Login module
2. Create/manage groups with dynamic membership (join/leave over time)
3. Create/manage expenses
4. Support every split type in the CSV (equal, unequal, percentage, share)
5. Individual balance summary
6. Group balance summary
7. Settle debts / record payments
8. Import `expenses_export.csv` through the app — no pre-editing allowed
9. Relational DB only (PostgreSQL)
10. Detect, surface, and handle every data anomaly with documented policy
11. Import report produced by the app
12. Public deployed URL
13. GitHub with meaningful commit history
14. README, SCOPE, DECISIONS, AI_USAGE documentation

### Hidden Requirements (not stated but implied)

| Hidden Requirement | Source of Inference |
|---|---|
| Historical membership: a member's join/leave date gates which expenses affect their balance | Sam says "I moved in mid-April. Why would March electricity affect me?" |
| Currency conversion (USD → INR) with real rates | Priya says "The sheet pretends a dollar is a rupee" |
| Soft delete with approval workflow | Meera says "I want to approve anything the app deletes or changes" |
| Minimum-transactions settlement display | Aisha says "I just want one number per person. Who pays whom, done." |
| Per-expense breakdown drill-down | Rohan says "I want to see exactly which expenses make up ₹2,300" |
| Staged import — anomalies reviewed before commit | Meera's approval requirement + "detect, surface, handle" mandate |
| Audit trail for every import decision | Assignment says "handle according to a policy you choose and document" |
| Exchange rate stored per expense (not global) | Goa trip expenses span multiple dates |
| Non-member guest handling | Dev's friend Kabir in Parasailing |
| Rounding policy must be explicit and consistent | Cylinder refill ₹899.995 |

---

## 2. Functional Requirements

### Authentication
- FR-A01: User registration with email + password
- FR-A02: User login returning JWT access token + refresh token
- FR-A03: Token refresh without re-login
- FR-A04: Logout (invalidate refresh token)
- FR-A05: Password change

### Groups
- FR-G01: Create a group with name, description, default currency
- FR-G02: List all groups the current user belongs to
- FR-G03: View group detail (members, balances, recent expenses)
- FR-G04: Add a member to a group with a `joinedAt` date
- FR-G05: Remove a member from a group (set `leftAt` date — soft)
- FR-G06: Edit group metadata
- FR-G07: Group-level balance summary (who owes whom, net)

### Expenses
- FR-E01: Create expense (description, date, amount, currency, split type, participants)
- FR-E02: Support split types: EQUAL, UNEQUAL, PERCENTAGE, SHARE
- FR-E03: Edit expense (triggers recalculation of splits)
- FR-E04: Soft-delete expense (requires approval if flagged)
- FR-E05: List expenses for a group with pagination + filters (by member, date range, currency)
- FR-E06: Per-expense breakdown: see each participant's exact share
- FR-E07: Per-member expense list: all expenses affecting one member's balance

### Balance Engine
- FR-B01: Compute net balance per member in a group
- FR-B02: Compute suggested minimum settlement transactions
- FR-B03: Balance respects membership dates (Sam not charged for pre-arrival expenses)
- FR-B04: Balance accounts for currency conversion (all in group default currency)
- FR-B05: Balance updates in real time after settlement or expense change

### Settlements
- FR-S01: Record a settlement (who paid whom, how much, when)
- FR-S02: Partial settlement (paying part of what is owed)
- FR-S03: View settlement history for a group
- FR-S04: Settlement adjusts balance immediately

### Import
- FR-I01: Upload `.xlsx` or `.csv` file
- FR-I02: Parse file without any pre-editing
- FR-I03: Detect all anomaly categories (18 types identified in audit)
- FR-I04: Stage import — do NOT write to DB until user approves
- FR-I05: Display anomaly review interface per row
- FR-I06: Per-anomaly actions: approve, reject, edit, skip
- FR-I07: Bulk approve/reject by severity
- FR-I08: Commit approved rows to DB in a transaction
- FR-I09: Rollback on commit failure
- FR-I10: Generate and display import report
- FR-I11: Store import history (every batch, every decision)
- FR-I12: USD → INR conversion at historical rate for expense date

### Reports
- FR-R01: Per-member spending report
- FR-R02: Monthly spending summary
- FR-R03: Settlement history report
- FR-R04: Import history log
- FR-R05: Currency conversion report (what rates were used)

---

## 3. Non-Functional Requirements

| NFR | Target | Rationale |
|---|---|---|
| API response time | < 200ms for balance queries | Balance page is primary view |
| Import processing | < 10s for 100-row file | UX constraint |
| Uptime | 99% (Render free tier) | Internship demo context |
| Data integrity | Zero balance drift | Decimal arithmetic only |
| Security | JWT + bcrypt + helmet + CORS | Production standard |
| Auditability | Every import decision stored | Meera's requirement |
| Mobile responsiveness | Tablet + mobile breakpoints | Modern web standard |
| Accessibility | WCAG AA minimum | Professional standard |

---

## 4. User Stories

```
US-001 [Aisha]: As Aisha, I want to see one number per person showing 
       exactly who owes whom, so I don't have to do mental math.

US-002 [Rohan]: As Rohan, I want to click on my balance and see every 
       expense that contributes to it, so I can verify there are no errors.

US-003 [Priya]: As Priya, I want USD expenses converted to INR at the 
       correct historical rate, not treated as rupees.

US-004 [Sam]: As Sam, I want my balance to only include expenses from 
       after mid-April when I moved in.

US-005 [Meera]: As Meera, I want to review and approve every anomaly 
       the importer finds before it changes any data.

US-006 [Any member]: As a group member, I want to record a payment 
       to settle my debt and see my balance update immediately.

US-007 [Admin]: As a group admin, I want to add/remove members and 
       set their join/leave dates accurately.

US-008 [Any member]: As a member, I want to upload the old spreadsheet 
       and have the app tell me exactly what it found wrong.
```

---

## 5. Edge Cases

### Membership Edge Cases
- EC-M01: Member appears in expense before their `joinedAt` date (Sam)
- EC-M02: Member appears in expense after their `leftAt` date (Meera, Row 35)
- EC-M03: Member rejoins after leaving (schema must support)
- EC-M04: Payer is not in the `split_with` list (paid but not splitting)
- EC-M05: Payer is also a participant — their `amountOwed` should be net of what they paid

### Split Edge Cases
- EC-S01: Percentages sum ≠ 100% (Pizza Friday, Weekend Brunch)
- EC-S02: EQUAL split with odd amounts (₹899.995 / 4 = ₹224.99875)
- EC-S03: SHARE type with share details missing or misformatted
- EC-S04: UNEQUAL amounts don't sum to total expense amount
- EC-S05: Only one participant in a split (self-expense)
- EC-S06: Participant listed in split_with not in the group

### Import Edge Cases
- EC-I01: Exact duplicate rows (same everything)
- EC-I02: Conflicting duplicates (same event, different amount/payer)
- EC-I03: Settlement logged as expense (no split_type, note mentions settlement)
- EC-I04: NULL `paid_by` — cannot compute who is owed
- EC-I05: NULL `currency` — unknown denomination
- EC-I06: Date stored in DD/MM format, parsed as MM/DD by Excel/openpyxl
- EC-I07: Ambiguous date where day ≤ 12 (both interpretations are valid calendar dates)
- EC-I08: Non-member guest in split (Dev's friend Kabir)
- EC-I09: Negative amount (refund vs. error)
- EC-I10: Zero amount (placeholder vs. actual)

### Currency Edge Cases
- EC-C01: No exchange rate available for a historical date (API down/holiday)
- EC-C02: Currency code missing entirely
- EC-C03: Same expense split has participants in different currencies
- EC-C04: Exchange rate API returns cached vs. real-time rate

### Balance Edge Cases
- EC-B01: Balance after full settlement should be exactly 0.00 (floating point risk)
- EC-B02: Three-way debt cycle: A owes B, B owes C, C owes A
- EC-B03: Member with `leftAt` still has unsettled balance
- EC-B04: Group with only one active member

---

## 6. Product Decisions

### PD-01: Staged Import (not immediate)
- **Decision:** Import creates an `ImportBatch` with all parsed rows and anomalies. No data is written to the DB until the user explicitly commits.
- **Rationale:** Meera's requirement. The CSV has 18 anomalies. Committing bad data silently is a failing answer.
- **Alternative:** Write rows immediately, flag bad ones for later correction.
- **Tradeoff:** More complex import flow. Worth it for data integrity.

### PD-02: Soft Delete Only
- **Decision:** No hard deletes anywhere in the system. Every table uses `status` or `deletedAt`.
- **Rationale:** Meera's "approve before delete" requirement. Also needed for audit trail.
- **Tradeoff:** Queries must always filter `WHERE status != 'DELETED'`.

### PD-03: Historical Exchange Rates per Expense
- **Decision:** Fetch exchange rate for each USD expense using the expense's date. Store rate in `Expense.exchangeRateToGroupCurrency`.
- **Rationale:** Priya's requirement. All 4 USD expenses are on different dates.
- **Tradeoff:** Requires external API call during import.

### PD-04: Membership Date Gates Balance
- **Decision:** A member's share of an expense is only counted if the expense date falls within their `[joinedAt, leftAt]` window.
- **Rationale:** Sam's explicit requirement.

### PD-05: Minimum Transactions for Settlement Display
- **Decision:** Balance summary shows the minimum number of payments needed to settle all debts (greedy algorithm on net balances).
- **Rationale:** Aisha wants "one number per person."

### PD-06: Deposit/Deposit-Paid-Back treated as Settlement
- **Decision:** "Rohan paid Aisha back" (Row 13) and "Sam deposit share" (Row 37) are imported as `Settlement` records, not `Expense` records.
- **Rationale:** They have no split — they're money transfers.

---

## 7. Architecture Decisions

### AD-01: Separate Frontend + Backend
- React (Vite) on Vercel, Express on Render, NeonDB PostgreSQL.

### AD-02: Repository Pattern + Service Layer
- `repository → service → controller → route` layering throughout backend.

### AD-03: Prisma ORM
- Type-safe queries, schema-as-code, migration tooling, built-in decimal support.

### AD-04: JWT with Refresh Token
- Short-lived access token (15 min) + long-lived refresh token (7 days) stored in httpOnly cookie.

### AD-05: `NUMERIC`/`Decimal` for All Money
- All monetary amounts stored as `NUMERIC(15,4)` in PostgreSQL. Never `FLOAT` or `DOUBLE`.

---

## 8. Security Decisions

- **SD-01:** bcrypt with salt rounds = 12
- **SD-02:** Separate JWT secrets for access and refresh tokens; stored in env vars
- **SD-03:** Every operation verifies requesting user is a member of that group
- **SD-04:** Zod schemas for every request body; sanitize all string inputs
- **SD-05:** Rate limiting: Import 5 req/min, Auth 10 req/min per IP
- **SD-06:** Strict CORS allow-list: only the Vercel frontend URL

---

## 9. Deployment Decisions

- **NeonDB:** Serverless PostgreSQL, free tier, built-in connection pooling
- **Render (Backend):** Free tier with auto-sleep; keep-alive cron job for demos
- **Vercel (Frontend):** Zero-config React deployment, preview URLs per branch
