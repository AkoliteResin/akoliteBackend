// Script to debug scheduledDate and orderId types in future_orders
const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://softwareakolite_db_user:ziC1W3x1n9tKIBpg@cluster0.unqau87.mongodb.net/';
const dbName = 'resinDB';

(async () => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection('future_orders');
    const docs = await col.find({}).toArray();
    docs.forEach(d => {
      console.log({
        _id: d._id,
        orderId: d.orderId,
        scheduledDate: d.scheduledDate,
        scheduledDateType: typeof d.scheduledDate,
        createdAt: d.createdAt
      });
    });
  } catch (err) {
    console.error('Failed to list orders:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
})();
