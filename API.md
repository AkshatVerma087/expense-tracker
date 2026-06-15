# API Documentation

## Authentication
`POST /api/auth/login`
- **Body**: `{ email, password }`
- **Response**: JWT access token + HTTP-Only refresh cookie.

`POST /api/auth/google`
- **Body**: `{ idToken }`
- **Response**: JWT access token.

## Groups
`GET /api/groups`
- **Response**: Array of groups the current user belongs to.

`POST /api/groups`
- **Body**: `{ name, description, currency }`
- **Response**: Newly created group object.

`POST /api/groups/:groupId/members`
- **Body**: `{ email }`
- **Response**: Success message and membership details.

## Expenses
`GET /api/groups/:groupId/expenses`
- **Response**: Array of all active expenses in the group.

`POST /api/groups/:groupId/expenses`
- **Body**: `{ description, amount, currency, expenseDate, paidById, splitType, participants: [{ userId, splitValue }] }`
- **Response**: Created expense and exact calculated participant shares.

## Settlements
`POST /api/groups/:groupId/settlements`
- **Body**: `{ receiverId, amount, date }`
- **Response**: Created settlement record.

## Import Engine
`POST /api/groups/:groupId/import/upload`
- **Body**: `multipart/form-data` containing the CSV file.
- **Response**: Created `ImportBatch` ID.

`GET /api/groups/:groupId/import/batches/:batchId`
- **Response**: Batch details including all parsed rows and their anomalies.

`POST /api/groups/:groupId/import/batches/:batchId/commit`
- **Response**: Executes the transaction and commits the batch to the ledger.

## Balances
`GET /api/groups/:groupId/balances`
- **Response**: Object containing individual member totals (`totalPaid`, `totalOwed`, `netBalance`) and the `suggestedSettlements` array.
