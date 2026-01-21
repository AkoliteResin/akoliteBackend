const { MongoClient } = require('mongodb');

const uri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const admin = client.db().admin();
    const dbs = await admin.listDatabases();
    console.log("Local Databases:");
    dbs.databases.forEach(db => console.log(` - ${db.name}`));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

run();
