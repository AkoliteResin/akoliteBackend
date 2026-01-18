const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://prajwal:1234@cluster0.g8d72.mongodb.net/Akolite?retryWrites=true&w=majority";
const client = new MongoClient(uri);

async function run() {
  try {
    console.log("Attempting to connect to Cloud DB...");
    await client.connect();
    console.log("✅ Connected to Cloud DB!");
    const db = client.db('Akolite');
    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));
  } catch (err) {
    console.error("❌ Connection failed:", err.message);
  } finally {
    await client.close();
  }
}

run();
