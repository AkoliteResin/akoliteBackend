const { connectDB } = require('./src/db');

async function migrateResins() {
  try {
    const { resinsCollection } = await connectDB();
    const db = resinsCollection.db;

    console.log('🔄 Starting migration: resin_products -> resins...');

    // Get all documents from resin_products collection
    const resinProductsCollection = db.collection('resin_products');
    const resinProducts = await resinProductsCollection.find().toArray();

    if (resinProducts.length === 0) {
      console.log('⚠️  No documents found in resin_products collection.');
    } else {
      console.log(`📦 Found ${resinProducts.length} documents in resin_products`);

      // Insert all documents into resins collection
      const result = await resinsCollection.insertMany(resinProducts);
      console.log(`✅ Inserted ${result.insertedIds.length} documents into resins collection`);

      // Delete the resin_products collection
      await resinProductsCollection.drop();
      console.log('🗑️  Deleted resin_products collection');

      console.log('✅ Migration completed successfully!');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrateResins();
