// One-time normalization script
// Fix records that have orderNumber ending with S1 but were actually full dispatch (no S2 sibling)
// - Removes trailing S1 so orderNumber becomes the base
// - Sets fromSplit = false
// Safe to run multiple times; it only updates applicable records

const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb://127.0.0.1:27017';
const dbName = 'resinDB';

(async () => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection('produced_resins');

    // Fetch all deployed records that are derived from an original production (i.e., dispatch rows)
    const all = await col.find({ status: 'deployed', originalProductionId: { $exists: true } }).toArray();

    // Group by originalProductionId
    const groups = new Map();
    for (const r of all) {
      const key = String(r.originalProductionId);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    let updated = 0;
    let groupsProcessed = 0;

    const baseFromOrderNumber = (ord) => {
      if (!ord) return null;
      const m = String(ord).match(/^(\d{12,14})(?:S[12])?$/);
      return m ? m[1] : ord;
    };

    for (const [key, records] of groups.entries()) {
      groupsProcessed++;
      if (records.length === 0) continue;

      // Derive a base order number from any record in the group
      let base = baseFromOrderNumber(records[0].orderNumber);
      if (!base) continue;

      // Separate client vs godown
      const clientRows = records.filter(r => (r.clientName || '').toLowerCase() !== 'godown');
      const godownRows = records.filter(r => (r.clientName || '').toLowerCase() === 'godown');

      if (clientRows.length >= 1 && godownRows.length >= 1) {
        // This is a split: enforce S1 on client and S2 on godown
        const ops = [];
        for (const r of clientRows) {
          const want = base + 'S1';
          if (r.orderNumber !== want || r.fromSplit !== true) {
            ops.push({
              updateOne: {
                filter: { _id: r._id },
                update: { $set: { orderNumber: want, fromSplit: true } }
              }
            });
          }
        }
        for (const r of godownRows) {
          const want = base + 'S2';
          if (r.orderNumber !== want || r.fromSplit !== true) {
            ops.push({
              updateOne: {
                filter: { _id: r._id },
                update: { $set: { orderNumber: want, fromSplit: true } }
              }
            });
          }
        }
        if (ops.length) {
          const res = await col.bulkWrite(ops);
          updated += res.modifiedCount || 0;
          console.log(`Group ${key}: enforced split suffixes (ops=${ops.length})`);
        }
      } else if (records.length === 1) {
        // Single dispatch row: full dispatch. Remove suffix and clear split flag
        const r = records[0];
        if (r.orderNumber !== base || r.fromSplit === true) {
          const res = await col.updateOne({ _id: r._id }, { $set: { orderNumber: base, fromSplit: false } });
          updated += res.modifiedCount || 0;
          console.log(`Group ${key}: normalized single row ${r._id} to base ${base}`);
        }
      } else {
        // Multiple rows but not a clear client/godown pair. Best effort: if any godown rows exist without client rows,
        // strip suffix to base and set fromSplit=false (treat as direct-to-godown full dispatch)
        const ops = [];
        if (clientRows.length === 0 && godownRows.length >= 1) {
          for (const r of godownRows) {
            const want = base;
            if (r.orderNumber !== want || r.fromSplit === true) {
              ops.push({
                updateOne: {
                  filter: { _id: r._id },
                  update: { $set: { orderNumber: want, fromSplit: false } }
                }
              });
            }
          }
        }
        if (ops.length) {
          const res = await col.bulkWrite(ops);
          updated += res.modifiedCount || 0;
          console.log(`Group ${key}: normalized ambiguous set (ops=${ops.length})`);
        }
      }
    }

    console.log(`\nGroups processed: ${groupsProcessed}, Docs updated: ${updated}`);
  } catch (err) {
    console.error('Normalization failed:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
})();
