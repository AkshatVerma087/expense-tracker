# Architecture & System Design

I designed this application utilizing a decoupled, API-driven monolithic architecture. My primary focus was creating a highly auditable, mathematically robust backend capable of processing dirty, real-world data without breaking.

## System Design
- **Frontend (React/Vite)**: I chose a Single Page Application (SPA) architecture for fluid, uninterrupted user interactions. I intentionally avoided heavy CSS frameworks, relying on Vanilla CSS to demonstrate mastery over the styling cascade and responsive design logic.
- **Backend (Node.js/Express)**: I architected the backend using a strict Controller/Service pattern. Controllers are restricted to HTTP parsing and validation, while all complex business logic (e.g., greedy settlement algorithms, fractional decimal parsing) is isolated in stateless Service files.
- **Database (PostgreSQL via NeonDB)**: I selected PostgreSQL for its ACID compliance—a non-negotiable requirement for financial ledgers. I used Prisma ORM strictly for its type-safety and automated migration tracking.

## API Flow
1. **Request**: The client issues an HTTP request to the Express layer.
2. **Security**: My custom `authMiddleware` intercepts the request, verifying the HTTP-Only JWT token to protect against XSS and CSRF attacks.
3. **Controller Processing**: The controller extracts the payload and validates the parameters.
4. **Service Execution**: The business logic is executed. For complex reads, I wrote highly optimized raw SQL queries; for complex writes, I utilized Prisma's `$transaction` API to ensure all-or-nothing execution.
5. **Response**: A sanitized JSON object is returned.

## The Import Pipeline Architecture
The standout feature of this system is the CSV Import Pipeline. I designed it to be completely non-destructive.

1. **Upload**: A multipart form routes the raw CSV to memory.
2. **Parsing**: I utilized `csv-parse` to convert the buffer into structured JSON.
3. **The Anomaly Engine**: This is the brain of the pipeline. I wrote a dedicated service (`anomalyEngine.js`) that pipes every row through 18 distinct heuristic checks. It analyzes date formats, string-matches participant names using Levenshtein distance, and identifies duplicate hashes.
4. **Staging Queue**: Rather than risking the core ledger, I designed an intermediary staging area. The parsed data and anomaly codes are written to `ImportBatch` and `ImportRow` tables. 
5. **Commit Phase**: Once the user resolves the anomalies in the UI, the frontend signals a commit. I engineered the backend to execute a massive, batch `$transaction`. If even one row fails a database constraint during commit, the entire batch rolls back, guaranteeing zero partial writes.

## Balance Calculation Flow
To prevent frontend decimal drift, I mandated that all balance math occurs strictly on the server.

1. **Query Optimization**: I applied B-Tree indexes on all foreign keys (`userId`, `groupId`) in PostgreSQL, allowing me to execute massive ledger aggregations in milliseconds.
2. **Chronological Gating**: The system retrieves all expenses but filters out participant shares if the `expenseDate` does not align with their explicit `joinedAt`/`leftAt` timeline.
3. **The Greedy Algorithm**: After determining the exact `netBalance` of each user, the server separates them into arrays of Debtors and Creditors. I implemented a greedy algorithm that iteratively matches the largest debt to the largest credit.
4. **Result**: A ledger of 500 messy micro-transactions is mathematically reduced to 3 final settlement instructions, returning a clean, actionable payload to the frontend.
