const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

// Find and remove the updateOne block (lines that update order to completed)
const lines = content.split('\n');
const filtered = [];
let skipNext = 0;

for (let i = 0; i < lines.length; i++) {
  if (skipNext > 0) {
    skipNext--;
    continue;
  }
  
  // Check if this line starts the updateOne we want to remove
  if (lines[i].includes('await futureOrdersCollection.updateOne') && 
      lines[i+2] && lines[i+2].includes("status: 'completed'")) {
    // Skip this line and the next 3 lines (the entire updateOne call)
    skipNext = 3;
    continue;
  }
  
  filtered.push(lines[i]);
}

content = filtered.join('\n');

// Also update the comment to reflect the new behavior
content = content.replace(
  '// For produce-from-order: create a deployed record directly and mark the order completed',
  '// For produce-from-order: create a pending record in Active Orders'
);

fs.writeFileSync('server.js', content, 'utf8');
console.log('✅ Fixed! Produce-from-order now creates PENDING in Active Orders (order stays in Orders page)');
