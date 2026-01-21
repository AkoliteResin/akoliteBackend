// Script to remove orderId and orderNumber from all future_orders documents
const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://softwareakolite_db_user:ziC1W3x1n9tKIBpg@cluster0.unqau87.mongodb.net/';
const dbName = 'resinDB';

(async () => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection('future_orders');
    const result = await col.updateMany({}, { $unset: { orderId: '', orderNumber: '' } });
    console.log(`Removed orderId and orderNumber from ${result.modifiedCount} documents.`);
  } catch (err) {
    console.error('Failed to remove fields:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
})();
