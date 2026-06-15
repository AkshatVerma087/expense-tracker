# Testing Strategy

## Unit Tests
- **Anomaly Engine**: Isolated tests for `detectAnomalies()` to ensure edge cases like "Date format mismatch" and "Negative amount" correctly flag rows without requiring a database connection.
- **Balance Calculation**: Tests for the greedy simplification algorithm using mocked ledger arrays to ensure three-way and four-way debts resolve into the mathematical minimum number of transactions.

## Integration Tests
- **Expense Creation API**: Tests verifying that hitting `POST /api/expenses` correctly computes percentage and share splits, returning `201 Created` with proper `Decimal` precision.
- **Auth Flow**: Tests confirming that JWTs are issued correctly on login and that `authMiddleware` correctly blocks unauthorized requests to protected group routes.

## Import Tests
- **End-to-End Import Pipeline**: Utilizing the `test-importer.js` script to simulate uploading the dirty `expenses_export.csv`, verifying that the correct number of anomalies are generated in the pending `ImportBatch`.

## Balance Tests
- **Membership Gating Check**: Specific tests verifying that if User A's `joinedAt` is April 15th, an expense dated April 10th does not impact their `totalOwed`.
