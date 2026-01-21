const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://softwareakolite_db_user:ziC1W3x1n9tKIBpg@cluster0.unqau87.mongodb.net/';
const client = new MongoClient(uri);

async function connectDB() {
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
  }
  const db = client.db('resinDB');
  return {
    db, // add db object for direct access
    usersCollection: db.collection('users'),
    rawCollection: db.collection('raw_materials'),
    producedCollection: db.collection('produced_resins'),
    resinsCollection: db.collection('resins'),
    futureOrdersCollection: db.collection('future_orders'),
    clientsCollection: db.collection('clients'),
    sellersCollection: db.collection('sellers'),
    sellerPricesCollection: db.collection('seller_prices'),
    billingCollection: db.collection('billing'),
    batchSettingsCollection: db.collection('batch_settings'),
    expensesCollection: db.collection('expenses'),
    overtimeCollection: db.collection('overtime_expenses'),
  };
}

module.exports = { connectDB, client };
