const { MongoClient } = require('mongodb');

const uri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db('resinDB');
    const collections = await db.listCollections().toArray();
    console.log("Collections in resinDB:", collections.map(c => c.name));
    
    const raw = db.collection('raw_materials');
    const count = await raw.countDocuments();
    console.log("Raw Materials count:", count);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

run();
