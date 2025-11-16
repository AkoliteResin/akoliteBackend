const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

const oldCode = `    if (orderId && ObjectId.isValid(orderId)) {
      // For produce-from-order: create a deployed record directly and mark the order completed
      await producedCollection.insertOne({
        resinType,
        litres: Number(litres),
        unit: unit || 'litres',
        producedAt: now,
        materialsUsed: requiredMaterials,
        status: 'deployed',
        deployedAt: now,
        clientName: clientNameForRecord,
        fromOrderId: new ObjectId(orderId),
        orderNumber: orderNumberForRecord || null
      });

      await futureOrdersCollection.updateOne(
        { _id: new ObjectId(orderId) },
        { $set: { status: 'completed', completedAt: now, fulfilledQty: Number(litres) } }
      );

      return res.json({
        message: \`Produced and dispatched \${litres} \${unit || 'litres'} of \${resinType} for order \${orderNumberForRecord || ''}\`,
        requiredMaterials,
        movedTo: 'history'
      });
    }`;

const newCode = `    if (orderId && ObjectId.isValid(orderId)) {
      // For produce-from-order: create a pending record in Active Orders
      await producedCollection.insertOne({
        resinType,
        litres: Number(litres),
        unit: unit || 'litres',
        producedAt: now,
        materialsUsed: requiredMaterials,
        status: 'pending',
        clientName: clientNameForRecord,
        fromOrderId: new ObjectId(orderId),
        orderNumber: orderNumberForRecord || null
      });

      return res.json({
        message: \`Produced \${litres} \${unit || 'litres'} of \${resinType} for order \${orderNumberForRecord || ''}\`,
        requiredMaterials,
        movedTo: 'active'
      });
    }`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(serverPath, content, 'utf8');
  console.log('✅ Fixed: produce-from-order now creates PENDING record in Active Orders');
} else {
  console.log('❌ Could not find the exact code to replace. Manual edit required.');
}
