# Scope Document

## A. Problem Analysis

## Assignment Understanding

The CSV contains inconsistent and dirty data compiled from various flatmates with different formatting preferences.

Goals:
- Import data safely without requiring any pre-editing of the CSV.
- Detect anomalies automatically and stage them in a queue.
- Preserve audit trail by strictly enforcing soft deletes and requiring user approvals for destructive actions.
- Support changing memberships (e.g., users moving in/out mid-month).
- Generate accurate balances utilizing greedy algorithms for minimum transactions.

---

## B. Anomaly Log

### 1. Duplicate expenses (Exact)
Problem:
Two expenses appear to represent the exact same transaction.
Detection:
Same payer + amount + date + description string distance.
Policy:
Flag for user review and default to keeping the one with a note.
Action:
Marked as Pending Review.

### 2. Conflicting duplicate entries
Problem:
Two expenses refer to the same event but have conflicting payers or amounts.
Detection:
Same date and event keywords, but different amount or payer ID.
Policy:
Block import of both rows until the user explicitly selects one.
Action:
Marked as Pending Review.

### 3. Settlement recorded as expense
Problem:
A direct payment transfer between two users is logged alongside shared expenses.
Detection:
Missing `split_type` and description matches a payment/deposit pattern.
Policy:
Auto-classify as a Settlement and route to the settlements table.
Action:
Converted to Settlement Table.

### 4. Percentages sum mismatch
Problem:
The split percentages for an expense exceed or fall short of 100%.
Detection:
Sum of parsed `split_details` percentages != 100.
Policy:
Block the row and require the user to edit the percentages manually.
Action:
Marked as Pending Review.

### 5. Date format mismatch
Problem:
The spreadsheet was created in DD/MM/YYYY but read as MM/DD/YYYY by the parser.
Detection:
Day value ≤ 12, creating ambiguity in month/day translation.
Policy:
Auto-correct the date by swapping month and day, but require soft approval.
Action:
Auto-corrected and Pending User Approval.

### 6. Sub-paise amount
Problem:
The amount contains more than 2 decimal places (e.g., ₹899.995).
Detection:
Decimal places > 2.
Policy:
Round to 2 decimal places using `ROUND_HALF_UP`.
Action:
Rounded to ₹900.00.

### 7. Missing payer
Problem:
The `paid_by` field is missing.
Detection:
`paid_by` is NULL.
Policy:
Block the row until the user assigns a valid payer.
Action:
Marked as Pending Review.

### 8. Missing currency
Problem:
The `currency` field is NULL.
Detection:
`currency` is NULL.
Policy:
Default to the group's base currency and show a warning.
Action:
Assumed INR and Pending User Approval.

### 9. Unknown member in split
Problem:
A participant listed in `split_with` is not a registered member of the group.
Detection:
String match fails against all `GroupMember` emails and names.
Policy:
Merge the unknown participant's share into the payer's share.
Action:
Merged into payer's share.

### 10. Ambiguous payer name
Problem:
The payer's name has a typo or abbreviation (e.g., "Priya S").
Detection:
No exact string match found, requires fuzzy string matching.
Policy:
Suggest the closest match and require user confirmation.
Action:
Fuzzy matched and Pending User Approval.

### 11. Member inactive during expense date
Problem:
A user is listed in an expense that occurred before they joined or after they left.
Detection:
`expenseDate` falls outside of the user's `[joinedAt, leftAt]` window.
Policy:
Offer to remove the user and redistribute the cost among the remaining members.
Action:
Marked as Pending Review.

### 12. Negative amount
Problem:
The amount is less than 0 (usually a refund).
Detection:
Amount < 0.
Policy:
Import as a refund (reducing everyone's owed amount).
Action:
Converted to Refund.

### 13. USD currency requires conversion
Problem:
An expense is logged in USD while the group operates in INR.
Detection:
Currency code is USD.
Policy:
Fetch the historical exchange rate for the exact `expenseDate` from Frankfurter API.
Action:
Converted to INR using Historical Rate.

---

## C. Database Schema

Users
- id
- name
- email
- passwordHash
- createdAt

Groups
- id
- name
- description
- currency
- creatorId

GroupMembers
- id
- groupId
- userId
- role
- joinedAt
- leftAt

Expenses
- id
- groupId
- description
- amount
- currency
- originalCurrency
- exchangeRateToGroupCurrency
- expenseDate
- paidById
- splitType
- importBatchId
- deletedAt

ExpenseParticipants
- id
- expenseId
- userId
- amountOwed
- splitValue
- isSettled

Settlements
- id
- groupId
- payerId
- receiverId
- amount
- currency
- date
- deletedAt

ImportBatches
- id
- groupId
- status
- totalRows
- anomalyCount

ImportRows
- id
- batchId
- rawRowData
- parsedData
- anomalies
- status
- actionTaken
