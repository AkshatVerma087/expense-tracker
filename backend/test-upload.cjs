const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

async function testUpload() {
  const token = jwt.sign({ id: 'some-id' }, process.env.JWT_SECRET || 'supersecret', { expiresIn: '1d' });
  const filePath = 'd:/expense-tracker/expenses_export.csv';
  
  // Create a multipart form manually using native fetch
  // Node 18+ has native fetch and FormData
  const formData = new FormData();
  const fileBlob = new Blob([fs.readFileSync(filePath)]);
  formData.append('file', fileBlob, 'expenses_export.csv');

  try {
    const res = await fetch('http://localhost:5000/api/import/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    console.log('Status:', res.status);
    const body = await res.text();
    console.log('Body:', body);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testUpload();
