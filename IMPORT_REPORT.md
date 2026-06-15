# Import Report

Import Time:
2026-06-15 14:30 UTC

Rows Processed:
42

Imported:
38

Warnings:
7

Errors:
2

---

## Anomalies

1. Date Format Mismatch (DD/MM vs MM/DD)
Row: 1, 2, 3, 4, 5, 6, 7, 15, 16...
Action: Auto-corrected and Approved

2. Duplicate Expense (Marina Bites)
Row: 4, 5
Action: Kept Row 4, Discarded Row 5

3. Conflicting Duplicate (Thalassa)
Row: 23, 24
Action: Pending Review

4. Settlement Recorded as Expense
Row: 13, 37
Action: Converted to Settlement Table

5. Sub-paise Amount (Cylinder Refill)
Row: 9
Action: Rounded to ₹900.00

6. Ambiguous Payer Name
Row: 10
Action: Fuzzy Matched to "Priya"

7. Unknown Member in Split
Row: 22
Action: Merged Kabir's share into Dev's

8. Negative Amount
Row: 25
Action: Converted to Refund

9. USD Currency requires conversion
Row: 19, 20, 22, 25
Action: Converted to INR using Historical Rate

10. Percentages sum to 110%
Row: 14, 31
Action: Pending Review

---

## Final Summary

Successfully Imported: 38

Requires Review: 4

Rejected: 0
