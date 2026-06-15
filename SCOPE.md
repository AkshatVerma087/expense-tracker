# Scope Document

## A. Problem Analysis

## Assignment Understanding

Upon analyzing the provided CSV `expenses_export.csv`, I immediately identified that the dataset was heavily polluted. It appeared to be compiled by multiple flatmates over time, each using different formatting habits.

My primary architectural goal was to build a system that could ingest this data **safely** without requiring the user to manually "clean" the CSV in Excel beforehand. 

To achieve this, I determined the system needed to:
- **Import data into a staging queue**: Never write directly to the core ledger. Instead, hold the data in a temporary `ImportBatch` table.
- **Detect anomalies computationally**: Scan every row against the existing database state to catch logical errors.
- **Enforce an interactive audit trail**: Require human approval for resolving destructive conflicts (like duplicate rows).
- **Support chronological fluidity**: Understand that users like "Sam" move in mid-lease and shouldn't be charged for historical expenses.

---

## B. Anomaly Log

Below is the log of the anomalies I engineered the system to detect, and the policy I implemented to resolve them.

### 1. Duplicate expenses (Exact Match)
**Problem:** Two expenses appear to represent the exact same transaction.
**Detection:** The system calculates a hash of the payer ID, amount, date, and does a string-distance check on the description.
**Policy:** Flag for user review. Auto-select the entry that contains more metadata (e.g., a note), but require manual confirmation.
**Action:** Marked as Pending Review.

### 2. Conflicting duplicate entries
**Problem:** Two expenses refer to the same event but have conflicting payers or amounts (e.g., Aisha and Kabir both claim they paid for "Thalassa").
**Detection:** Same date and event keywords, but different amount or payer ID.
**Policy:** This is a severe data conflict. Block the import of both rows entirely until the user explicitly selects the correct version of events.
**Action:** Marked as Pending Review.

### 3. Settlement recorded as expense
**Problem:** A direct payment transfer between two users is logged alongside shared expenses, skewing the total group spend.
**Detection:** Missing `split_type` and description matches regex patterns for payments/deposits (e.g., "paid back", "settlement").
**Policy:** Intercept the row and automatically re-route it to the `Settlements` table rather than the `Expenses` table.
**Action:** Converted to Settlement Table.

### 4. Percentages sum mismatch
**Problem:** The split percentages for an expense exceed or fall short of 100%.
**Detection:** Mathematical validation: `SUM(split_details.percentages) != 100`.
**Policy:** Do not assume intent. Block the row and present an interactive UI for the user to fix the math.
**Action:** Marked as Pending Review.

### 5. Date format mismatch
**Problem:** The spreadsheet was created in DD/MM/YYYY but is being parsed as MM/DD/YYYY, causing valid dates to fail.
**Detection:** If the parsed `Date` object results in an invalid day, but swapping the month and day integers results in a valid date.
**Policy:** Auto-correct the date by swapping the integers, but present it as a soft warning so the user knows what happened.
**Action:** Auto-corrected and Pending User Approval.

### 6. Sub-paise amount
**Problem:** The amount contains unrealistic decimal precision (e.g., ₹899.995).
**Detection:** String length evaluation of the decimal mantissa > 2.
**Policy:** Apply standard financial rounding (`ROUND_HALF_UP`) to normalize the data.
**Action:** Rounded to ₹900.00.

### 7. Missing payer
**Problem:** The `paid_by` field is completely blank.
**Detection:** `paid_by` is NULL.
**Policy:** A ledger without a creditor is mathematically invalid. Block the row until the user manually assigns a payer from the dropdown.
**Action:** Marked as Pending Review.

### 8. Missing currency
**Problem:** The `currency` field is NULL.
**Detection:** `currency` is NULL.
**Policy:** Since most expenses are local, default to the group's base currency but surface a warning in case the user intended otherwise.
**Action:** Assumed INR and Pending User Approval.

### 9. Unknown member in split
**Problem:** A participant listed in the CSV is not a registered user in the system.
**Detection:** String match fails against all `GroupMember` emails and names.
**Policy:** The fairest programmatic assumption is that the person who paid covered the cost of the unknown guest. Merge the unknown participant's share into the payer's total.
**Action:** Merged guest share into payer's share.

### 10. Ambiguous payer name
**Problem:** The payer's name has a typo (e.g., "Priya S" instead of "Priya").
**Detection:** Exact string match fails.
**Policy:** Implement Levenshtein distance fuzzy matching to suggest the closest registered member, requiring user confirmation to prevent assigning debt to the wrong person.
**Action:** Fuzzy matched and Pending User Approval.

### 11. Member inactive during expense date
**Problem:** A user is included in an expense that occurred before they joined the group or after they left.
**Detection:** `expenseDate` falls outside of the user's explicit `[joinedAt, leftAt]` chronological window.
**Policy:** This violates the core rule of shared living. Flag the anomaly, offering a one-click fix to remove the user and recalculate the split among the remaining active members.
**Action:** Marked as Pending Review.

### 12. Negative amount
**Problem:** The amount is less than 0.
**Detection:** Amount < 0.
**Policy:** Negative expenses are logically refunds. Import the row but invert its polarity so it reduces everyone's owed balance.
**Action:** Converted to Refund.

### 13. USD currency requires conversion
**Problem:** An expense is logged in USD while the group ledger strictly operates in INR.
**Detection:** Currency code is USD.
**Policy:** 1 USD is not 1 INR. Query the Frankfurter API for the historical exchange rate on the exact `expenseDate` to ensure financial accuracy.
**Action:** Converted to INR using Historical Rate.

---

## C. Database Schema

I designed this schema manually using Prisma to ensure strict relational integrity and prevent orphaned data.

**Users**
The core identity table.
- id (UUID)
- name
- email (Unique)
- passwordHash
- createdAt

**Groups**
The container for a shared living arrangement.
- id (UUID)
- name
- description
- currency
- creatorId (Foreign Key -> Users)

**GroupMembers**
A timeline-based junction table connecting Users to Groups.
- id (UUID)
- groupId (Foreign Key -> Groups)
- userId (Foreign Key -> Users)
- role (ADMIN, MEMBER)
- joinedAt (Timestamp: Crucial for chronological gating)
- leftAt (Nullable Timestamp)

**Expenses**
The primary ledger entry.
- id (UUID)
- groupId (Foreign Key -> Groups)
- description
- amount (Decimal)
- currency
- originalCurrency
- exchangeRateToGroupCurrency
- expenseDate
- paidById (Foreign Key -> Users)
- splitType (Enum: EQUAL, PERCENTAGE, UNEQUAL, SHARES)
- importBatchId (Nullable Foreign Key -> ImportBatches)

**ExpenseParticipants**
The granular breakdown of exactly who owes what for a specific expense.
- id (UUID)
- expenseId (Foreign Key -> Expenses)
- userId (Foreign Key -> Users)
- amountOwed (Decimal)
- splitValue (Nullable Decimal: Stores the raw percentage or share count)
- isSettled (Boolean)

**Settlements**
Direct payment transfers to resolve debt.
- id (UUID)
- groupId (Foreign Key -> Groups)
- payerId (Foreign Key -> Users)
- receiverId (Foreign Key -> Users)
- amount (Decimal)
- currency
- date

**ImportBatches**
The staging container for an uploaded CSV.
- id (UUID)
- groupId (Foreign Key -> Groups)
- status (Enum: PROCESSING, NEEDS_REVIEW, READY, COMMITTED)
- totalRows
- anomalyCount

**ImportRows**
The granular staging table holding the parsed, uncommitted JSON data.
- id (UUID)
- batchId (Foreign Key -> ImportBatches)
- rawRowData (JSON: The original CSV text)
- parsedData (JSON: The structured attempt)
- anomalies (JSON: Array of detected anomaly codes)
- status (Enum: PENDING, RESOLVED)
- actionTaken (String: The user's resolution decision)
