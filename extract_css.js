const fs = require('fs');

const html = fs.readFileSync('d:/expense-tracker/DESIGN.html', 'utf8');
const match = html.match(/<style>([\s\S]*?)<\/style>/);

if (match) {
  fs.writeFileSync('d:/expense-tracker/frontend/src/index.css', match[1].trim());
  console.log("CSS extracted successfully.");
} else {
  console.log("Failed to find <style> tags.");
}
