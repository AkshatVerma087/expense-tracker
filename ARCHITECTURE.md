# Architecture & System Design

## System Design
The application follows a standard decoupled Monolith structure:
- **Frontend**: A React SPA (Single Page Application) built with Vite, handling UI state and routing via `react-router-dom`.
- **Backend**: An Express.js REST API serving as the central hub for business logic, authentication, and database transactions.
- **Database**: PostgreSQL (NeonDB serverless) interfaced via Prisma ORM for type-safe schema definitions and robust migration management.

## API Flow
1. **Request**: The client makes an HTTP request to the Express server (e.g., `POST /api/expenses`).
2. **Middleware**: The `authMiddleware` intercepts the request to validate the JWT stored in the `httpOnly` cookie.
3. **Controller**: `expenses.controller.js` parses the request body and validates input parameters.
4. **Service**: `expenses.service.js` executes the complex business logic (calculating decimal splits).
5. **Database**: Prisma executes the generated SQL queries against NeonDB.
6. **Response**: JSON payload is returned to the client.

## Import Pipeline
The CSV import pipeline is designed to be safe, non-destructive, and interactive:
1. **Upload**: User uploads a raw CSV/Excel file via Multer.
2. **Parse**: `csv-parse` translates the raw buffer into JSON.
3. **Anomaly Engine**: Each row is passed through `anomalyEngine.js`, which checks for 18 unique edge cases (e.g., date mismatches, missing payers, duplicate detection).
4. **Staging**: The parsed data and detected anomalies are saved to the `ImportBatch` and `ImportRow` tables with a `PENDING` status. No data is written to the ledger yet.
5. **Resolution**: The user reviews and resolves anomalies via the UI.
6. **Commit**: A single, optimized Prisma `$transaction` batches all `RESOLVED` rows into the actual `Expense` and `Settlement` tables simultaneously.

## Balance Calculation Flow
Balancing is handled entirely on the backend to prevent decimal drift:
1. **Fetch Data**: Retrieve all active `Expenses`, `ExpenseParticipants`, and `Settlements` for a specific group.
2. **Membership Gating**: Filter out expense participations if the `expenseDate` falls outside of the user's `[joinedAt, leftAt]` timestamps.
3. **Net Aggregation**: Calculate the absolute `netBalance` for each user by adding what they paid and subtracting what they owe.
4. **Simplification (Greedy Algorithm)**: 
   - Separate users into `debtors` (negative net balance) and `creditors` (positive net balance).
   - Sort both arrays by magnitude.
   - Iteratively cancel out the largest debt against the largest credit, generating a list of `suggestedSettlements`.
   - Result: Users are presented with the absolute minimum number of payment transactions needed to clear the entire group's debt.
