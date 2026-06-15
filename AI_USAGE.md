# AI Usage Report

## Tools Used

- Gemini 2.5 Pro (Antigravity Agent)
- ChatGPT
- Claude

## Example Prompts

Prompt:
Design PostgreSQL schema for shared expense application supporting dynamic group memberships, utilizing Prisma ORM.

Outcome:
Generated the initial `schema.prisma` definitions for Users, Groups, GroupMembers, Expenses, and ExpenseParticipants.

Prompt:
Write a Node.js Express route to handle CSV parsing without any external editing, returning a structured JSON array.

Outcome:
Generated the Multer upload middleware and `csv-parse` service layer functions.

## AI Mistake #1

Issue:
AI suggested deleting duplicate expenses automatically during the import phase.

Why Wrong:
The assignment explicitly requires an anomaly review workflow where the user makes the final decision on conflicting duplicates.

Fix:
I discarded the AI's auto-delete logic and implemented an anomaly review queue (the `ImportBatch` and `ImportRow` tables) that flags `DUPLICATE_CONFLICTING` anomalies for manual user approval.

## AI Mistake #2

Issue:
AI completely ignored group membership dates when calculating balances.

Why Wrong:
Sam moved into the apartment in mid-April. He should not be charged for electricity or rent expenses from March. 

Fix:
I modified the database schema to include `joinedAt` and `leftAt` timestamps on the `GroupMember` table, and updated the balance calculation engine to gate expense inclusion based on the `expenseDate`.

## AI Mistake #3

Issue:
AI treated USD and INR equally, blindly adding them together in the math algorithms.

Why Wrong:
Currency conversion is required to maintain ledger accuracy (e.g. the Goa Villa was paid in USD, but the group ledger operates in INR).

Fix:
I integrated the Frankfurter API to fetch historical exchange rates based on the `expenseDate` and built an exchange-rate conversion engine that caches rates to minimize network latency.
