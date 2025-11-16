const { MongoClient } = require('mongodb');

const uri = 'mongodb://127.0.0.1:27017';
const client = new MongoClient(uri);

async function connectDB() {
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
  }
  const db = client.db('resinDB');
  return {
    rawCollection: db.collection('raw_materials'),
    producedCollection: db.collection('produced_resins'),
    futureOrdersCollection: db.collection('future_orders'),
    clientsCollection: db.collection('clients'),
    billingCollection: db.collection('billing'),
    batchSettingsCollection: db.collection('batch_settings'),
    expensesCollection: db.collection('expenses'),
  };
}

module.exports = { connectDB, client };
