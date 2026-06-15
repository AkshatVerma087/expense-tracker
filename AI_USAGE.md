# AI Usage Report

Throughout the development of this project, I maintained strict architectural authority over the system design. I utilized AI solely as a "junior implementation assistant" to rapidly generate boilerplate code, formulate regex patterns, and scaffold UI components based on my explicit instructions. 

## Tools Used
- **ChatGPT & Claude**: Used for querying syntax, generating Tailwind layouts, and acting as a sounding board.
- **Gemini 2.5 Pro (Antigravity Agent)**: Used to execute my implementation plans inside the IDE, specifically for scaffolding the Express boilerplate.

## Example Prompts
**My Prompt:**
> "I have decided to implement a timeline-based membership model to solve the mid-lease move-in problem. Generate a Prisma schema containing `Users`, `Groups`, and a `GroupMembers` junction table with `joinedAt` and `leftAt` timestamps."

**Outcome:**
The AI generated the raw Prisma schema definitions, saving me 15 minutes of typing, while perfectly adhering to my architectural requirement.

---

## Code Review: Catching AI Mistakes

Because I treated the AI as a junior developer, I conducted rigorous code reviews on all generated output. I frequently rejected its initial suggestions when they compromised data integrity or violated the business constraints I had established. 

### AI Mistake #1: Destructive Deletions
**The Issue:** 
When I asked the AI how to handle duplicate CSV expenses, it immediately wrote a script to `DELETE` matching rows automatically during the import phase.
**Why it was wrong:** 
Auto-deleting financial data violates the core principle of a safe audit trail, and directly contradicted Meera's requirement for a manual review workflow.
**My Fix:** 
I rejected the script entirely. Instead, I architected the `ImportBatch` and `ImportRow` staging tables. I forced the system to flag the `DUPLICATE_CONFLICTING` anomaly and halt execution until the user manually clicked an approval button in the UI.

### AI Mistake #2: Ignoring Chronology
**The Issue:** 
The AI generated a standard many-to-many relationship for group memberships, assuming all users in a group share all expenses equally.
**Why it was wrong:** 
It failed to account for chronological fluidity. Sam joined later in the year, and charging him for historical expenses was unacceptable. 
**My Fix:** 
I intervened at the schema level, explicitly mandating the `joinedAt` and `leftAt` timestamps. I then rewrote the balance calculation service myself, adding the date-gating logic (`expenseDate >= joinedAt && expenseDate <= leftAt`) to ensure mathematical fairness.

### AI Mistake #3: Blind Currency Aggregation
**The Issue:** 
When writing the ledger aggregation query, the AI simply ran a raw `SUM(amount)` across the database.
**Why it was wrong:** 
The CSV contained a mix of USD and INR expenses. Summing them together blindly created massive financial inaccuracies.
**My Fix:** 
I discarded the raw query. I engineered an integration with the Frankfurter API to fetch historical exchange rates, converting the USD value into the group's base INR currency at the exact moment of the expense, ensuring the ledger math remained pristine.
