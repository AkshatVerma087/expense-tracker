# Shared Expenses App

## Overview
A comprehensive shared expense management application designed to solve the complexities of real-world flatmate financial ledgers. I built this application to handle dynamic living situations where members join or leave mid-lease, currencies fluctuate, and human data-entry errors are inevitable.

At its core, this application serves as an immutable, auditable ledger that supports:
- **Dynamic Group Membership**: Strict chronological gating of expenses to ensure members only pay for the time they lived in the apartment.
- **Granular Expense Tracking**: Support for Equal, Unequal, Percentage, and Share-based splitting mathematics.
- **Debt Settlements**: Tracking direct payments to resolve debts.
- **Algorithmic Balance Simplification**: Minimizing the raw ledger into the absolute fewest number of payment transactions using a greedy algorithm.
- **Interactive CSV Import Engine**: A robust staging area that detects and surfaces 18 unique data anomalies from dirty spreadsheets before any data is committed to the database.

## Tech Stack
**Frontend:**
- **React (Vite)**: Chosen for rapid hot-module reloading and optimized production builds.
- **Vanilla CSS**: I opted for Vanilla CSS to maintain absolute control over the design system without the overhead or class-clutter of utility frameworks.

**Backend:**
- **Node.js & Express**: A lightweight, decoupled architecture that strictly separates route definitions from core business logic.
- **Prisma ORM**: Utilized for its unparalleled type-safety. I designed the schema directly in Prisma to guarantee that my database structure matches my application logic perfectly.

**Database:**
- **PostgreSQL (NeonDB)**: A serverless Postgres provider. I implemented B-Tree indexes on all foreign keys to optimize the complex relational joins required for balance calculation.

**Authentication:**
- **JWT (JSON Web Tokens)**: Stateful authentication using secure, HTTP-Only cookies to protect against XSS attacks.
- **Google OAuth**: Integrated for frictionless user onboarding.

**Deployment:**
- **Vercel**: Hosting the global edge-cached frontend.
- **Railway**: Hosting the persistent backend Node process.

## Setup Instructions

### Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

### Frontend
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite dev server:
   ```bash
   npm run dev
   ```

### Database Setup
1. Create a `.env` file in the `backend` folder containing your NeonDB connection string and JWT secrets:
   ```env
   DATABASE_URL="postgres://your-neon-db-url"
   JWT_SECRET="your_secret"
   REFRESH_TOKEN_SECRET="your_refresh_secret"
   ```
2. Push my schema to your database instance:
   ```bash
   npx prisma db push
   ```

## AI Tools Used
I believe AI is a powerful tactical tool, but it cannot replace strategic architectural oversight. Throughout this project, I used:
- **ChatGPT & Claude**: Strictly as junior implementation assistants to generate boilerplate algorithms and component templates. I maintained full ownership over the database schema, business rules, and anomaly detection policies.

## Deployment Links
- **Frontend Live App**: [https://expense-tracker-eight-gray-14.vercel.app](https://expense-tracker-eight-gray-14.vercel.app)
- **Backend API**: [https://spiltease-backend.onrender.com](https://spiltease-backend.onrender.com)
