# SCOPE.md — Data Audit & Anomaly Registry
## Spreetail Shared Expenses App

---

## Complete Anomaly Registry (18 Confirmed Anomalies)

### A-01: DATE_FORMAT_MISMATCH
- **Rows Affected:** 1,2,3,4,5,6,7,15,16,17,18,19,20,21,22,23,24,25,26,33,34,35,36,37,38,39 (26 rows)
- **Severity:** 🔴 CRITICAL
- **Description:** The spreadsheet was created in an Indian locale (DD/MM/YYYY). When openpyxl reads Excel date serials, it interprets them as MM/DD/YYYY. "February rent" stored as 01/02/2026 is read as January 2nd, not February 1st. Every row where the day value ≤ 12 has its month and day swapped.
- **Detection Logic:** For rows where openpyxl returns a Python `datetime` object AND the day value ≤ 12, the date is suspect. Cross-reference month in description vs. parsed month.
- **User Message:** `"Date appears to be in DD/MM/YYYY format but was read as MM/DD/YYYY. We have corrected [original] → [corrected]. Please verify."`
- **Resolution Strategy:** Auto-correct: swap month and day when day ≤ 12. Show corrected date in review UI. Require user acknowledgment.
- **Approval Required:** Yes

---

### A-02: DUPLICATE_EXACT
- **Rows Affected:** 4 & 5 (Marina Bites dinner)
- **Severity:** 🔴 CRITICAL
- **Description:** "Dinner at Marina Bites" (Row 4, Dev, ₹3200, has note) and "dinner - marina bites" (Row 5, Dev, ₹3200, no note). Same date, same payer, same amount. Only description casing and punctuation differ.
- **Detection Logic:** After normalization, check for rows with identical `(normalized_description, paid_by, amount, currency, date)`. Levenshtein distance < 5 on description.
- **User Message:** `"Two entries appear to be the same expense logged twice. Row 4 has an additional note. Suggested action: Keep Row 4, discard Row 5."`
- **Resolution Strategy:** Flag both. Default suggestion: keep the one with a note (Row 4). Require explicit user approval to delete Row 5.
- **Approval Required:** Yes

---

### A-03: DUPLICATE_CONFLICTING
- **Rows Affected:** 23 & 24 (Thalassa dinner)
- **Severity:** 🔴 CRITICAL
- **Description:** "Dinner at Thalassa" (Row 23, Aisha paid, ₹2400) and "Thalassa dinner" (Row 24, Rohan paid, ₹2450). Same date, different payers, different amounts. Row 24 note: "Aisha also logged this I think hers is wrong."
- **Resolution Strategy:** BLOCK both rows. Do not import either until user explicitly selects one. Cannot auto-resolve.
- **Approval Required:** Yes — mandatory

---

### A-04: SETTLEMENT_AS_EXPENSE
- **Rows Affected:** 13 (Rohan paid Aisha back, ₹5000)
- **Severity:** 🔴 CRITICAL
- **Description:** "Rohan paid Aisha back" — ₹5000, no `split_type`. This is a payment transfer between two people, not a shared expense.
- **Detection Logic:** `split_type IS NULL` AND description matches payment pattern.
- **Resolution Strategy:** Auto-classify as Settlement (Rohan → Aisha, ₹5000). Import into `settlements` table.
- **Approval Required:** Yes

---

### A-05: PERCENTAGE_SUM_INVALID
- **Rows Affected:** 14 (Pizza Friday), 31 (Weekend Brunch)
- **Severity:** 🔴 CRITICAL
- **Description:** Both rows: Aisha 30% + Rohan 30% + Priya 30% + Meera 20% = 110%.
- **Detection Logic:** Parse `split_details` for percentage values. Sum them. If `|sum - 100| > 0.01`, flag.
- **Resolution Strategy:** BLOCK both rows. Require user to edit percentages.
- **Approval Required:** Yes — mandatory

---

### A-06: SUB_PAISE_AMOUNT
- **Rows Affected:** 9 (Cylinder refill, ₹899.995)
- **Severity:** 🟡 MEDIUM
- **Description:** Amount has 3 decimal places. ₹899.995 / 4 = ₹224.99875 — not representable in paise.
- **Resolution Strategy:** Round to 2 decimal places (ROUND_HALF_UP). Log original and rounded values.
- **Approval Required:** No — auto-apply with notification

---

### A-07: MISSING_PAYER
- **Rows Affected:** 12 (House cleaning supplies, ₹780)
- **Severity:** 🔴 CRITICAL
- **Description:** `paid_by` is NULL. Note: "can't remember who paid."
- **Resolution Strategy:** BLOCK. Import only if user selects a payer in review UI.
- **Approval Required:** Yes — mandatory

---

### A-08: MISSING_CURRENCY
- **Rows Affected:** 27 (Groceries DMart, ₹2105)
- **Severity:** 🟡 MEDIUM
- **Description:** `currency` is NULL. Context suggests INR.
- **Resolution Strategy:** Default to group currency (INR). Show warning. User can override.
- **Approval Required:** Yes — soft confirmation

---

### A-09: UNKNOWN_MEMBER_IN_SPLIT
- **Rows Affected:** 22 (Parasailing, Dev's friend Kabir)
- **Severity:** 🟡 MEDIUM
- **Description:** `split_with` includes "Dev's friend Kabir" — not a registered group member.
- **Resolution Strategy:** Merge Kabir's share into Dev's share. Log clearly.
- **Approval Required:** Yes

---

### A-10: AMBIGUOUS_PAYER_NAME
- **Rows Affected:** 10 (Groceries DMart, "Priya S")
- **Severity:** 🟡 MEDIUM
- **Description:** `paid_by = "Priya S"` — no exact match. Fuzzy match → "Priya".
- **Resolution Strategy:** Fuzzy match → suggest "Priya." Require user confirmation.
- **Approval Required:** Yes

---

### A-11: PAYER_NAME_CASE_MISMATCH
- **Rows Affected:** 8 ("priya"), 26 ("rohan")
- **Severity:** 🟢 LOW
- **Description:** `paid_by` in lowercase. Auto-normalize silently.
- **Resolution Strategy:** Auto-normalize.
- **Approval Required:** No

---

### A-12: MEMBER_POST_DEPARTURE
- **Rows Affected:** 35 (Groceries BigBasket, April 2, 2026, Meera in split)
- **Severity:** 🔴 CRITICAL
- **Description:** Meera moved out March 31. Row 35 is April 2. Meera should not be in this expense.
- **Resolution Strategy:** Flag. Offer to remove Meera and redistribute. User confirms.
- **Approval Required:** Yes

---

### A-13: ZERO_AMOUNT
- **Rows Affected:** 30 (Dinner order Swiggy, ₹0.00)
- **Severity:** 🟡 MEDIUM
- **Description:** Amount is ₹0. Note: "counted twice earlier - fixing later."
- **Resolution Strategy:** Default: skip. User can override to import as ₹0 expense.
- **Approval Required:** Yes

---

### A-14: NEGATIVE_AMOUNT_REFUND
- **Rows Affected:** 25 (Parasailing refund, -$30 USD)
- **Severity:** 🟡 MEDIUM
- **Description:** Amount is -$30. Note: "one slot got cancelled." Legitimate partial refund.
- **Resolution Strategy:** Import as negative expense. Each participant's `amount_owed` decreases.
- **Approval Required:** Yes

---

### A-15: AMBIGUOUS_DATE
- **Rows Affected:** 33 (Deep cleaning service)
- **Severity:** 🟡 MEDIUM
- **Description:** Date could be April 5 or May 4. Note: "is this April 5 or May 4? format is a mess."
- **Resolution Strategy:** FLAG. Present both options. User must select. No default.
- **Approval Required:** Yes — mandatory

---

### A-16: DEPOSIT_AS_EXPENSE
- **Rows Affected:** 37 (Sam deposit share, ₹15,000, Sam → Aisha)
- **Severity:** 🟡 MEDIUM
- **Description:** "Sam moving in! paid Aisha his deposit." One-to-one payment, not a shared expense.
- **Resolution Strategy:** Import as Settlement (Sam → Aisha, ₹15,000).
- **Approval Required:** Yes

---

### A-17: FOREIGN_CURRENCY_USD
- **Rows Affected:** 19 (Goa villa, $540), 20 (Beach shack, $84), 22 (Parasailing, $150), 25 (Parasailing refund, -$30)
- **Severity:** 🔴 CRITICAL
- **Description:** 4 rows in USD. Group default currency is INR. Must convert at historical rate.
- **Resolution Strategy:** Fetch from `api.frankfurter.app/[date]?from=USD&to=INR`. Store rate. Show to user. Allow override.
- **Approval Required:** Yes

---

### A-18: EQUAL_WITH_SHARE_DETAILS
- **Rows Affected:** 41 (Furniture for common room)
- **Severity:** 🟢 LOW
- **Description:** `split_type = 'equal'` but `split_details = 'Aisha 1; Rohan 1; Priya 1; Sam 1'`. Redundant but consistent.
- **Resolution Strategy:** Use EQUAL split. Log as informational.
- **Approval Required:** No

---

## Anomaly Summary Table

| Code | Description | Rows | Severity | Resolution | Approval |
|------|-------------|------|----------|------------|---------|
| A-01 | Date format mismatch (DD/MM ↔ MM/DD) | 26 rows | 🔴 CRITICAL | Auto-correct + confirm | Yes |
| A-02 | Exact duplicate (Marina Bites) | 4, 5 | 🔴 CRITICAL | Keep Row 4, discard Row 5 | Yes |
| A-03 | Conflicting duplicate (Thalassa) | 23, 24 | 🔴 CRITICAL | Block — user selects | Yes |
| A-04 | Settlement as expense (Rohan→Aisha) | 13 | 🔴 CRITICAL | Import as Settlement | Yes |
| A-05 | Percentages sum to 110% | 14, 31 | 🔴 CRITICAL | Block — user edits | Yes |
| A-06 | Sub-paise amount (₹899.995) | 9 | 🟡 MEDIUM | Round to ₹900.00 | No |
| A-07 | Missing payer | 12 | 🔴 CRITICAL | Block — user assigns | Yes |
| A-08 | Missing currency | 27 | 🟡 MEDIUM | Default INR + confirm | Yes |
| A-09 | Unknown member (Kabir) | 22 | 🟡 MEDIUM | Merge into Dev's share | Yes |
| A-10 | Ambiguous payer name ("Priya S") | 10 | 🟡 MEDIUM | Fuzzy match → confirm | Yes |
| A-11 | Payer name case mismatch | 8, 26 | 🟢 LOW | Auto-normalize | No |
| A-12 | Member after departure (Meera, Apr 2) | 35 | 🔴 CRITICAL | Remove + redistribute | Yes |
| A-13 | Zero amount | 30 | 🟡 MEDIUM | Skip (recommended) | Yes |
| A-14 | Negative amount (refund) | 25 | 🟡 MEDIUM | Import as refund | Yes |
| A-15 | Ambiguous date (Apr 5 vs May 4) | 33 | 🟡 MEDIUM | Block — user selects | Yes |
| A-16 | Deposit as expense (Sam→Aisha) | 37 | 🟡 MEDIUM | Import as Settlement | Yes |
| A-17 | USD currency requires conversion | 19, 20, 22, 25 | 🔴 CRITICAL | Fetch historical rate | Yes |
| A-18 | Equal split with share details | 41 | 🟢 LOW | Use EQUAL, log note | No |

**Total: 18 anomalies across 42 data rows.**
