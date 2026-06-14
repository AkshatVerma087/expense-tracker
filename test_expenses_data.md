# Expense Testing Data

Since you need to replace the placeholders with your actual IDs, you can use this file as a scratchpad!

**Your Access Token:**
`Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

**Your Group ID:**
`21b0e7dd-3b7f-4168-8f69-ed6601b4313c`

**Your User ID (Paid By):**
`dc5d2c94-ac30-47d4-bf6e-cb7bb41d5fcb`

**Friend's User ID:**
*(Replace with the ID from the Get Group Details response)*

---

### Test 1: EQUAL Split

**URL:** `http://localhost:5000/api/groups/21b0e7dd-3b7f-4168-8f69-ed6601b4313c/expenses`
**Method:** POST

**Headers:**
- `Authorization`: `Bearer <YOUR_ACCESS_TOKEN>`
- `Content-Type`: `application/json`

**Body (JSON):**
```json
{
  "description": "Dinner at Mario's",
  "amount": "100.00",
  "currency": "USD",
  "paidById": "dc5d2c94-ac30-47d4-bf6e-cb7bb41d5fcb",
  "splitType": "EQUAL",
  "participants": [
    { "userId": "dc5d2c94-ac30-47d4-bf6e-cb7bb41d5fcb" },
    { "userId": "<FRIEND_USER_ID>" }
  ]
}
```

---

### Test 2: PERCENTAGE Split

**URL:** `http://localhost:5000/api/groups/21b0e7dd-3b7f-4168-8f69-ed6601b4313c/expenses`
**Method:** POST

**Headers:**
- `Authorization`: `Bearer <YOUR_ACCESS_TOKEN>`
- `Content-Type`: `application/json`

**Body (JSON):**
```json
{
  "description": "Uber from Airport",
  "amount": "50.00",
  "currency": "USD",
  "paidById": "dc5d2c94-ac30-47d4-bf6e-cb7bb41d5fcb",
  "splitType": "PERCENTAGE",
  "participants": [
    { 
      "userId": "dc5d2c94-ac30-47d4-bf6e-cb7bb41d5fcb",
      "splitValue": "60" 
    },
    { 
      "userId": "<FRIEND_USER_ID>",
      "splitValue": "40" 
    }
  ]
}
```
