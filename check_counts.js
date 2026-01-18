const { MongoClient } = require('mongodb');

const uri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db('resinDB');
    
    const cols = ['clients', 'expenses', 'future_orders', 'produced_resins'];
    for (const name of cols) {
        const count = await db.collection(name).countDocuments();
        console.log(`${name}: ${count}`);
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

run();
