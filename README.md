# Shared Expenses App

## Overview
A shared expense management application that supports:
- Dynamic group membership
- Expense tracking
- Multiple split types
- Debt settlements
- CSV import with anomaly detection
- Balance simplification

## Tech Stack
Frontend:
- React
- Vite
- Vanilla CSS

Backend:
- Node.js
- Express
- Prisma ORM

Database:
- PostgreSQL (NeonDB)

Authentication:
- JWT
- Google OAuth

Deployment:
- Vercel (Frontend)
- Render/Railway (Backend)

## Features
- Authentication (Email & Google)
- Group management with member joining/leaving dates
- Expense management with 4 split types (Equal, Unequal, Percentage, Share)
- Balance calculations (minimizing settlement transactions)
- Settlement tracking
- CSV import engine (parsing dirty data natively)
- Import anomaly review workflow (detects 18 unique anomalies)

## Setup Instructions

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Database
Create a `.env` file in the `backend` folder:
```env
DATABASE_URL=postgres://your-neon-db-url
JWT_SECRET=your_secret
REFRESH_TOKEN_SECRET=your_refresh_secret
```
Then run:
```bash
npx prisma db push
```

## AI Tools Used
- Gemini 2.5 Pro (Antigravity Agent)
- ChatGPT
- Claude

## Deployment Links
Frontend: [Insert Vercel URL]
Backend: [Insert Render URL]
