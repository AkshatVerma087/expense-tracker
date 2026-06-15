const BASE_URL = 'http://localhost:5000/api';

export function getAuthToken() {
  return localStorage.getItem('token');
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
}

export async function apiFetch(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = 'An error occurred';
    try {
      const data = await response.json();
      errorMsg = data.error || errorMsg;
    } catch (e) {
      // JSON parse error
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

// Groups API
export async function getGroups() {
  return apiFetch('/groups');
}

export async function createGroup(name, description) {
  return apiFetch('/groups', {
    method: 'POST',
    body: JSON.stringify({ name, description })
  });
}

export async function getGroupDetails(groupId) {
  return apiFetch(`/groups/${groupId}`);
}

export async function addGroupMember(groupId, email) {
  return apiFetch(`/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function removeGroupMember(groupId, userId) {
  return apiFetch(`/groups/${groupId}/members/${userId}`, {
    method: 'PUT' // API uses PUT to set leftAt
  });
}

export async function updateGroup(groupId, name, description) {
  return apiFetch(`/groups/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify({ name, description })
  });
}

export async function getGroupBalances(groupId) {
  return apiFetch(`/groups/${groupId}/balances`);
}

export async function getGroupExpenses(groupId) {
  return apiFetch(`/groups/${groupId}/expenses`);
}

export async function createExpense(groupId, expenseData) {
  return apiFetch(`/groups/${groupId}/expenses`, {
    method: 'POST',
    body: JSON.stringify(expenseData)
  });
}

export async function updateExpense(groupId, expenseId, expenseData) {
  return apiFetch(`/groups/${groupId}/expenses/${expenseId}`, {
    method: 'PUT',
    body: JSON.stringify(expenseData)
  });
}

export async function deleteExpense(groupId, expenseId) {
  return apiFetch(`/groups/${groupId}/expenses/${expenseId}`, {
    method: 'DELETE'
  });
}

// Importer APIs
export async function uploadCSV(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const token = getAuthToken();
  const res = await fetch(`${BASE_URL}/import/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to upload CSV');
  }
  return res.json();
}

export async function getBatchStatus(groupId, batchId) {
  return apiFetch(`/groups/${groupId}/import/batches/${batchId}`);
}

export async function resolveRow(groupId, batchId, rowId, actionTaken, updatedParsedData) {
  return apiFetch(`/groups/${groupId}/import/batches/${batchId}/rows/${rowId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ actionTaken, updatedParsedData })
  });
}

export async function commitBatch(groupId, batchId) {
  return apiFetch(`/groups/${groupId}/import/batches/${batchId}/commit`, {
    method: 'POST'
  });
}

export async function downloadBatchReport(groupId, batchId) {
  const token = getAuthToken();
  const response = await fetch(`${BASE_URL}/groups/${groupId}/import/batches/${batchId}/report`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) throw new Error('Failed to download report');
  
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `IMPORT_REPORT_${batchId}.md`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function getAllBatches() {
  return apiFetch('/import/batches');
}

// Settlement APIs
export async function recordSettlement(groupId, payerId, receiverId, amount) {
  return apiFetch(`/groups/${groupId}/settlements`, {
    method: 'POST',
    body: JSON.stringify({ payerId, receiverId, amount })
  });
}

export async function getGroupSettlements(groupId) {
  return apiFetch(`/groups/${groupId}/settlements`);
}

export async function getDashboardMetrics() {
  return apiFetch('/users/me/dashboard');
}

export async function getBatchRows(groupId, batchId) {
  return apiFetch(`/groups/${groupId}/import/batches/${batchId}`);
}

export async function changePassword(oldPassword, newPassword) {
  return apiFetch('/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ oldPassword, newPassword })
  });
}
