# ARCHITECTURE.md — System & API Design
## Spreetail Shared Expenses App

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Vercel)                       │
│   React + TypeScript + Tailwind + React Router + Axios      │
│                                                              │
│   Pages: Login, Register, Dashboard, Groups, Expenses,      │
│          Import, Import Review, Reports, Settlement          │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS + JWT Bearer Token
                             │
┌────────────────────────────▼────────────────────────────────┐
│                     BACKEND (Render)                         │
│   Express + TypeScript                                       │
│                                                              │
│   Routes → Zod Validation → Controller → Service            │
│                                              ↓               │
│                                         Repository           │
└────────────────────────────────────────────┬────────────────┘
                                             │ Prisma
┌────────────────────────────────────────────▼────────────────┐
│                    DATABASE (NeonDB)                          │
│                PostgreSQL 15 (Serverless)                    │
└──────────────────────────────────┬──────────────────────────┘
                                   │
                          ┌────────▼────────┐
                          │ frankfurter.app  │
                          │ (exchange rates) │
                          └─────────────────┘
```

---

## Request Lifecycle

```
Client Request
    → Express Router
    → Rate Limiter Middleware
    → Auth Middleware (verifyJWT) — extracts userId from token
    → Zod Validation Middleware — validates request body/params
    → Controller — calls service(s)
    → Service Layer — business logic
    → Repository Layer — Prisma queries only
    → NeonDB PostgreSQL
    ← JSON Response
```

---

## Authentication Flow

```
1. POST /auth/register
   → hash password (bcrypt, 12 rounds)
   → create user in DB
   → return 201 (require explicit login)

2. POST /auth/login
   → find user by email
   → verify password with bcrypt.compare
   → generate accessToken (JWT, 15min, in-memory on client)
   → generate refreshToken (JWT, 7 days, httpOnly cookie)
   → store hash(refreshToken) in refresh_tokens table
   → return { accessToken, user }

3. Every authenticated request:
   → Authorization: Bearer <accessToken>
   → verifyJWT middleware decodes token
   → attaches { userId } to req.user

4. POST /auth/refresh
   → read refreshToken from httpOnly cookie
   → find token hash in DB, check not revoked, not expired
   → issue new accessToken

5. POST /auth/logout
   → mark refresh token as revoked in DB
   → clear cookie
```

---

## Balance Calculation Algorithm

```
GET /groups/:id/balances

1. Fetch all active group members with their [joinedAt, leftAt] windows

2. Fetch all ACTIVE expenses for the group with expense_participants.
   Apply membership gate:
   - expense_date >= member.joinedAt AND
   - (member.leftAt IS NULL OR expense_date <= member.leftAt)

3. Fetch all settlements for the group

4. For each member M:
   paid_total            = SUM(expenses.amount_in_group_currency WHERE paid_by = M)
   owed_total            = SUM(expense_participants.amount_owed WHERE user_id = M AND gate passes)
   received_settlements  = SUM(settlements.amount WHERE receiver_id = M)
   paid_settlements      = SUM(settlements.amount WHERE payer_id = M)
   
   net_balance = paid_total - owed_total + received_settlements - paid_settlements

5. Minimum Settlement Algorithm (greedy):
   creditors = members where net_balance > 0 (sorted DESC)
   debtors   = members where net_balance < 0 (sorted ASC)
   
   while creditors and debtors non-empty:
     payment = min(creditor.balance, abs(debtor.balance))
     emit: { from: debtor, to: creditor, amount: payment }
     adjust balances
     remove settled parties

6. Return:
   {
     members: [{ userId, name, netBalance }],
     suggestedSettlements: [{ from, to, amount }]
   }
```

---

## Import Pipeline

```
Phase 1: UPLOAD & PARSE
  POST /groups/:id/import
  → multer handles file (memory, max 10MB)
  → SheetJS/xlsx or papaparse parses file
  → Normalize column names
  → Extract raw rows as array

Phase 2: ANOMALY DETECTION (pure functions, zero DB writes)
  → DateNormalizer        : detect DD/MM ↔ MM/DD
  → DuplicateDetector     : exact + fuzzy match
  → MemberValidator       : check names against group
  → CurrencyResolver      : flag USD, fetch historical rates
  → SplitValidator        : verify percentages sum to 100
  → SettlementDetector    : identify settlement-like rows
  
  Each detector returns: { rowIndex, anomalyCode, severity, 
                           description, originalValue, suggestedValue }

Phase 3: STAGING (one DB write)
  → Create ImportBatch (status = PENDING_REVIEW)
  → Store parsed rows as JSONB in staged_data
  → Create ImportAnomaly per detected anomaly
  → Return batchId to client

Phase 4: REVIEW (UI)
  GET /import-batches/:id → fetch batch + anomalies
  User actions: APPROVE / REJECT / EDIT / BULK_APPROVE_LOW / BULK_APPROVE_MEDIUM

Phase 5: COMMIT (DB transaction)
  POST /import-batches/:id/commit
  → BEGIN TRANSACTION
  → For each row in staged_data:
    - Skip if REJECTED anomaly
    - Abort if PENDING CRITICAL anomaly
    - Apply approved corrections
    - Create Expense or Settlement record
    - Create ExpenseParticipant records
  → Update ImportBatch status = COMMITTED
  → Create AuditLog entries
  → COMMIT (or ROLLBACK on failure)

Phase 6: REPORT
  GET /import-batches/:id/report
  → Aggregate: rows imported, rows skipped, anomalies by type
  → Return JSON (also downloadable)
```

---

## API Endpoints

### Auth
```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
PATCH  /auth/password
GET    /users/me
PATCH  /users/me
```

### Groups
```
GET    /groups                     # List user's groups
POST   /groups                     # Create group
GET    /groups/:id                 # Group detail
PATCH  /groups/:id                 # Edit group
GET    /groups/:id/members         # List members
POST   /groups/:id/members         # Add member
PATCH  /groups/:id/members/:uid    # Update membership dates
DELETE /groups/:id/members/:uid    # Soft-remove member
GET    /groups/:id/export          # Export group data as CSV
```

### Expenses
```
GET    /groups/:id/expenses        # List (paginated, filterable)
POST   /groups/:id/expenses        # Create expense
GET    /expenses/:id               # Expense detail + breakdown
PATCH  /expenses/:id               # Edit expense
DELETE /expenses/:id               # Soft delete
```

### Balances
```
GET    /groups/:id/balances        # Net balances + settlement suggestions
GET    /groups/:id/balances/history # Balance over time
```

### Settlements
```
GET    /groups/:id/settlements     # Settlement history
POST   /groups/:id/settlements     # Record payment
GET    /settlements/:id            # Settlement detail
```

### Import
```
POST   /groups/:id/import          # Upload file → parse → stage
GET    /import-batches             # List import history
GET    /import-batches/:id         # Batch detail + anomalies
PATCH  /import-batches/:id/anomalies/:aid  # Resolve anomaly
POST   /import-batches/:id/commit  # Commit to DB
GET    /import-batches/:id/report  # Import report
GET    /exchange-rates/:date       # Check historical rate
```

### Reports
```
GET    /groups/:id/reports/spending      # Per-member spending
GET    /groups/:id/reports/monthly       # Monthly summary
GET    /groups/:id/reports/settlements   # Settlement history
GET    /groups/:id/reports/import-log    # Import history
GET    /groups/:id/reports/currencies    # Exchange rates used
```

---

## Backend Folder Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── index.ts
│   │   └── database.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── validate.middleware.ts
│   │   ├── error.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   └── upload.middleware.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── groups/
│   │   ├── members/
│   │   ├── expenses/
│   │   ├── settlements/
│   │   ├── balances/
│   │   └── import/
│   │       ├── parsers/
│   │       │   ├── xlsx.parser.ts
│   │       │   └── csv.parser.ts
│   │       ├── detectors/
│   │       │   ├── date.detector.ts
│   │       │   ├── duplicate.detector.ts
│   │       │   ├── member.detector.ts
│   │       │   ├── currency.detector.ts
│   │       │   ├── split.detector.ts
│   │       │   └── settlement.detector.ts
│   │       ├── import.normalizer.ts
│   │       └── import.committer.ts
│   ├── services/
│   │   ├── currency.service.ts
│   │   └── audit.service.ts
│   ├── types/
│   ├── utils/
│   │   ├── decimal.ts
│   │   ├── date.ts
│   │   └── response.ts
│   └── app.ts
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
└── server.ts
```

---

## Frontend Folder Structure

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts
│   │   ├── auth.api.ts
│   │   ├── groups.api.ts
│   │   ├── expenses.api.ts
│   │   ├── settlements.api.ts
│   │   ├── balances.api.ts
│   │   └── import.api.ts
│   ├── contexts/
│   │   └── AuthContext.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useGroups.ts
│   │   ├── useExpenses.ts
│   │   ├── useBalances.ts
│   │   └── useImport.ts
│   ├── pages/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── groups/
│   │   ├── expenses/
│   │   ├── import/
│   │   └── reports/
│   ├── components/
│   │   ├── layout/
│   │   ├── ui/
│   │   ├── balance/
│   │   ├── expenses/
│   │   └── import/
│   └── utils/
│       ├── formatCurrency.ts
│       └── formatDate.ts
└── vite.config.ts
```

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Render cold start (~30s) | Keep-alive cron job via cron-job.org every 14 min |
| Exchange rate API down | Fallback to cached `exchange_rates` table; allow manual entry |
| Prisma N+1 in balance query | Use `include` carefully or write single raw SQL aggregation |
| JWT in localStorage (XSS) | Access token in React state only; refresh token in httpOnly cookie |
| Import commit partial failure | Atomic transaction; full rollback on any row failure |
