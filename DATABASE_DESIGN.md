# DATABASE_DESIGN.md
## Spreetail Shared Expenses App

---

## Design Principles
1. Every monetary value: `NUMERIC(15,4)` — never FLOAT
2. Every timestamp: `TIMESTAMPTZ` (timezone-aware)
3. Every ID: `UUID`
4. Soft deletes via `status` enum or `deleted_at` timestamp
5. Every foreign key has an index
6. Audit trail on every critical table

---

## Table: `users`
**Purpose:** Authentication identity. Decoupled from group membership to allow the same person to participate in multiple groups.

| Column | Type | Constraints | Why |
|--------|------|-------------|-----|
| id | UUID | PK, default gen | Stable identifier |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Login identifier |
| name | VARCHAR(100) | NOT NULL | Display name |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hash |
| avatar_url | TEXT | NULL | Profile picture |
| created_at | TIMESTAMPTZ | default NOW() | Audit |
| updated_at | TIMESTAMPTZ | default NOW() | Audit |

**Indexes:** `idx_users_email` on `(email)`

---

## Table: `refresh_tokens`
**Purpose:** Revocable JWT refresh tokens. Allows explicit logout server-side.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK users.id |
| token_hash | VARCHAR(255) | UNIQUE |
| expires_at | TIMESTAMPTZ | NOT NULL |
| created_at | TIMESTAMPTZ | default NOW() |
| revoked_at | TIMESTAMPTZ | NULL |

---

## Table: `groups`
**Purpose:** A household or trip unit. Expenses and memberships belong to a group.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | VARCHAR(100) | NOT NULL |
| description | TEXT | NULL |
| default_currency | VARCHAR(3) | NOT NULL, default 'INR' |
| created_by | UUID | FK users.id |
| status | VARCHAR(20) | default 'ACTIVE' |
| created_at | TIMESTAMPTZ | default NOW() |
| updated_at | TIMESTAMPTZ | default NOW() |

---

## Table: `group_memberships`
**Purpose:** Temporal membership. A member's liability for expenses is gated by their `joined_at` and `left_at`. Core of Sam's requirement.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| group_id | UUID | FK groups.id |
| user_id | UUID | FK users.id |
| role | VARCHAR(20) | default 'MEMBER' |
| joined_at | TIMESTAMPTZ | NOT NULL |
| left_at | TIMESTAMPTZ | NULL |
| invited_by | UUID | FK users.id, NULL |
| created_at | TIMESTAMPTZ | default NOW() |

**Constraints:**
- `UNIQUE (group_id, user_id, joined_at)` — supports re-join
- `CHECK (left_at IS NULL OR left_at > joined_at)`

**Indexes:**
- `idx_memberships_group_user` on `(group_id, user_id)`
- `idx_memberships_group_active` on `(group_id) WHERE left_at IS NULL`

---

## Table: `expenses`
**Purpose:** Core data entity. Every shared cost.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| group_id | UUID | FK groups.id |
| description | VARCHAR(500) | NOT NULL |
| expense_date | DATE | NOT NULL |
| original_amount | NUMERIC(15,4) | NOT NULL |
| original_currency | VARCHAR(3) | NOT NULL |
| amount_in_group_currency | NUMERIC(15,2) | NOT NULL |
| exchange_rate | NUMERIC(12,6) | NULL |
| exchange_rate_source | VARCHAR(100) | NULL |
| exchange_rate_date | DATE | NULL |
| split_type | VARCHAR(20) | NOT NULL |
| paid_by_user_id | UUID | FK users.id, NULL |
| import_batch_id | UUID | FK import_batches.id, NULL |
| status | VARCHAR(20) | default 'ACTIVE' |
| notes | TEXT | NULL |
| category | VARCHAR(50) | NULL |
| created_by | UUID | FK users.id |
| created_at | TIMESTAMPTZ | default NOW() |
| updated_at | TIMESTAMPTZ | default NOW() |
| deleted_at | TIMESTAMPTZ | NULL |

**Indexes:**
- `idx_expenses_group_date` on `(group_id, expense_date DESC)`
- `idx_expenses_paid_by` on `(paid_by_user_id)`
- `idx_expenses_import_batch` on `(import_batch_id)`
- `idx_expenses_status` partial on `(status) WHERE status != 'DELETED'`

---

## Table: `expense_participants`
**Purpose:** Each person's exact share of an expense. This IS the balance — the sum of `amount_owed` per user gives total liability.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| expense_id | UUID | FK expenses.id |
| user_id | UUID | FK users.id |
| share_numerator | INTEGER | NULL |
| share_denominator | INTEGER | NULL |
| percentage | NUMERIC(6,3) | NULL |
| amount_owed | NUMERIC(15,2) | NOT NULL |
| is_settled | BOOLEAN | default false |
| created_at | TIMESTAMPTZ | default NOW() |

**Constraints:**
- `UNIQUE (expense_id, user_id)`
- `CHECK (percentage IS NULL OR (percentage > 0 AND percentage <= 100))`

**Indexes:**
- `idx_participants_expense` on `(expense_id)`
- `idx_participants_user` on `(user_id)` — critical for balance query
- `idx_participants_user_settled` on `(user_id, is_settled)`

---

## Table: `settlements`
**Purpose:** Records payments between members. Separate from expenses because a settlement is a transfer, not a cost.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| group_id | UUID | FK groups.id |
| payer_id | UUID | FK users.id |
| receiver_id | UUID | FK users.id |
| amount | NUMERIC(15,2) | NOT NULL |
| settled_at | DATE | NOT NULL |
| notes | TEXT | NULL |
| import_batch_id | UUID | FK import_batches.id, NULL |
| created_by | UUID | FK users.id |
| created_at | TIMESTAMPTZ | default NOW() |

**Constraints:**
- `CHECK (payer_id != receiver_id)`
- `CHECK (amount > 0)`

---

## Table: `import_batches`
**Purpose:** Tracks every CSV import run. Holds staged data and anomalies BEFORE commit. Source for import report deliverable.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| group_id | UUID | FK groups.id |
| uploaded_by | UUID | FK users.id |
| filename | VARCHAR(255) | NOT NULL |
| file_size_bytes | INTEGER | — |
| total_rows | INTEGER | — |
| valid_rows | INTEGER | — |
| anomaly_count | INTEGER | — |
| status | VARCHAR(30) | default 'PENDING_REVIEW' |
| staged_data | JSONB | NOT NULL |
| created_at | TIMESTAMPTZ | default NOW() |
| reviewed_at | TIMESTAMPTZ | NULL |
| committed_at | TIMESTAMPTZ | NULL |
| committed_by | UUID | FK users.id, NULL |

**Status values:** `PENDING_REVIEW` / `IN_REVIEW` / `COMMITTED` / `REJECTED` / `PARTIAL`

---

## Table: `import_anomalies`
**Purpose:** One row per anomaly detected per import batch. Allows per-anomaly resolution tracking (Meera's requirement).

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| import_batch_id | UUID | FK import_batches.id |
| row_index | INTEGER | NOT NULL |
| anomaly_code | VARCHAR(30) | NOT NULL |
| severity | VARCHAR(10) | NOT NULL |
| description | TEXT | NOT NULL |
| original_value | JSONB | NULL |
| suggested_value | JSONB | NULL |
| status | VARCHAR(20) | default 'PENDING' |
| resolution_notes | TEXT | NULL |
| resolved_by | UUID | FK users.id, NULL |
| resolved_at | TIMESTAMPTZ | NULL |

---

## Table: `anomaly_resolutions`
**Purpose:** Audit log of every decision made during anomaly review. History of how an anomaly's state changed.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| anomaly_id | UUID | FK import_anomalies.id |
| action | VARCHAR(20) | NOT NULL |
| previous_value | JSONB | NULL |
| new_value | JSONB | NULL |
| notes | TEXT | NULL |
| performed_by | UUID | FK users.id |
| performed_at | TIMESTAMPTZ | default NOW() |

---

## Table: `audit_logs`
**Purpose:** Every mutation in the system logged.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| entity_type | VARCHAR(50) | NOT NULL |
| entity_id | UUID | NOT NULL |
| action | VARCHAR(20) | NOT NULL |
| old_values | JSONB | NULL |
| new_values | JSONB | NULL |
| performed_by | UUID | FK users.id |
| performed_at | TIMESTAMPTZ | default NOW() |
| ip_address | VARCHAR(45) | NULL |
| user_agent | TEXT | NULL |

**Indexes:**
- `idx_audit_entity` on `(entity_type, entity_id)`
- `idx_audit_user` on `(performed_by)`
- `idx_audit_time` on `(performed_at DESC)`

---

## Table: `exchange_rates`
**Purpose:** Cache historical USD/INR rates. Ensures reproducibility — same rate always used for same date.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| from_currency | VARCHAR(3) | NOT NULL |
| to_currency | VARCHAR(3) | NOT NULL |
| rate_date | DATE | NOT NULL |
| rate | NUMERIC(12,6) | NOT NULL |
| source | VARCHAR(100) | NOT NULL |
| fetched_at | TIMESTAMPTZ | default NOW() |

**Constraints:** `UNIQUE (from_currency, to_currency, rate_date)`

---

## Table: `notifications`
**Purpose:** Future-proof. Used to flag pending anomaly reviews for now.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK users.id |
| type | VARCHAR(50) | NOT NULL |
| title | VARCHAR(200) | NOT NULL |
| body | TEXT | NULL |
| is_read | BOOLEAN | default false |
| reference_id | UUID | NULL |
| reference_type | VARCHAR(50) | NULL |
| created_at | TIMESTAMPTZ | default NOW() |

---

## Entity Relationship Summary

```
users ──< group_memberships >── groups
users ──< expenses (paid_by)
groups ──< expenses
expenses ──< expense_participants >── users
groups ──< settlements
settlements >── users (payer)
settlements >── users (receiver)
groups ──< import_batches
import_batches ──< import_anomalies
import_anomalies ──< anomaly_resolutions
users ──< audit_logs
exchange_rates (standalone cache)
users ──< refresh_tokens
users ──< notifications
```
