const express = require("express");
const router = express.Router();
const { connectDB } = require("../db");

// Get all sellers
router.get("/", async (req, res) => {
  try {
    const { sellersCollection } = await connectDB();
    const sellers = await sellersCollection.find({}).toArray();
    res.json(sellers);
  } catch (err) {
    console.error("Error fetching sellers:", err);
    res.status(500).json({ error: "Failed to fetch sellers" });
  }
});

// Get single seller
router.get("/:id", async (req, res) => {
  try {
    const { sellersCollection } = await connectDB();
    const seller = await sellersCollection.findOne({
      _id: new (require("mongodb")).ObjectId(req.params.id),
    });
    if (!seller) {
      return res.status(404).json({ error: "Seller not found" });
    }
    res.json(seller);
  } catch (err) {
    console.error("Error fetching seller:", err);
    res.status(500).json({ error: "Failed to fetch seller" });
  }
});

// Add new seller
router.post("/", async (req, res) => {
  try {
    const { sellersCollection } = await connectDB();
    const {
      name,
      phone,
      email,
      company,
      address,
      gst,
      state,
      district,
      rawMaterialsSupplied,
      notes,
    } = req.body;

    if (!name || !phone) {
      return res
        .status(400)
        .json({ error: "Name and phone are required" });
    }

    if (!rawMaterialsSupplied || rawMaterialsSupplied.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one raw material must be supplied" });
    }

    const newSeller = {
      name,
      phone,
      email: email || "",
      company: company || "",
      address: address || "",
      gst: gst || "",
      state: state || "",
      district: district || "",
      rawMaterialsSupplied: rawMaterialsSupplied || [],
      notes: notes || "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await sellersCollection.insertOne(newSeller);
    res.status(201).json({ ...newSeller, _id: result.insertedId });
  } catch (err) {
    console.error("Error adding seller:", err);
    res.status(500).json({ error: "Failed to add seller" });
  }
});

// Update seller
router.put("/:id", async (req, res) => {
  try {
    const { sellersCollection } = await connectDB();
    const {
      name,
      phone,
      email,
      company,
      address,
      gst,
      state,
      district,
      rawMaterialsSupplied,
      notes,
    } = req.body;

    if (rawMaterialsSupplied !== undefined && rawMaterialsSupplied.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one raw material must be supplied" });
    }

    const updateData = {
      ...(name && { name }),
      ...(phone && { phone }),
      ...(email !== undefined && { email }),
      ...(company !== undefined && { company }),
      ...(address !== undefined && { address }),
      ...(gst !== undefined && { gst }),
      ...(state !== undefined && { state }),
      ...(district !== undefined && { district }),
      ...(rawMaterialsSupplied !== undefined && { rawMaterialsSupplied }),
      ...(notes !== undefined && { notes }),
      updatedAt: new Date(),
    };

    const result = await sellersCollection.updateOne(
      { _id: new (require("mongodb")).ObjectId(req.params.id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Seller not found" });
    }

    res.json({ message: "Seller updated successfully" });
  } catch (err) {
    console.error("Error updating seller:", err);
    res.status(500).json({ error: "Failed to update seller" });
  }
});

// Delete seller
router.delete("/:id", async (req, res) => {
  try {
    const { sellersCollection } = await connectDB();
    const result = await sellersCollection.deleteOne({
      _id: new (require("mongodb")).ObjectId(req.params.id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Seller not found" });
    }

    res.json({ message: "Seller deleted successfully" });
  } catch (err) {
    console.error("Error deleting seller:", err);
    res.status(500).json({ error: "Failed to delete seller" });
  }
});

// Update seller prices
router.post("/prices/update", async (req, res) => {
  try {
    console.log('Price update request received:', req.body);
    const { sellersCollection, sellerPricesCollection } = await connectDB();
    const { sellerId, sellerName, prices } = req.body;

    if (!sellerId || !prices || prices.length === 0) {
      console.log('Missing required fields');
      return res.status(400).json({ error: "Missing required fields: sellerId, prices" });
    }

    // Get today's date at midnight for consistent date comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // For each price, replace any existing price for same seller/material/date
    let insertedCount = 0;
    let updatedCount = 0;

    for (const price of prices) {
      const priceDate = new Date(price.date);
      priceDate.setHours(0, 0, 0, 0);

      // Check if price entry exists for this seller/material/date
      const existingPrice = await sellerPricesCollection.findOne({
        sellerId,
        material: price.material,
        date: { $gte: priceDate, $lt: new Date(priceDate.getTime() + 86400000) }, // Same day
      });

      if (existingPrice) {
        // Update existing price for same day
        await sellerPricesCollection.updateOne(
          { _id: existingPrice._id },
          {
            $set: {
              price: price.price,
              updatedAt: new Date(),
            }
          }
        );
        updatedCount++;
        console.log(`Updated price for ${sellerName} - ${price.material}: ₹${price.price} on ${priceDate.toISOString().split('T')[0]}`);
      } else {
        // Insert new price
        await sellerPricesCollection.insertOne({
          sellerId,
          sellerName,
          material: price.material,
          price: price.price,
          date: priceDate,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        insertedCount++;
        console.log(`Inserted new price for ${sellerName} - ${price.material}: ₹${price.price} on ${priceDate.toISOString().split('T')[0]}`);
      }
    }

    res.json({
      message: "Prices updated successfully",
      insertedCount,
      updatedCount,
    });
  } catch (err) {
    console.error("Error updating prices:", err);
    res.status(500).json({ error: err.message || "Failed to update prices" });
  }
});

// Get seller prices (with 5-day history)
router.get("/prices/:sellerId", async (req, res) => {
  try {
    const { sellerPricesCollection } = await connectDB();
    const { sellerId } = req.params;
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const prices = await sellerPricesCollection
      .find({
        sellerId,
        date: { $gte: fiveDaysAgo },
      })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(5)
      .toArray();

    res.json(prices);
  } catch (err) {
    console.error("Error fetching prices:", err);
    res.status(500).json({ error: "Failed to fetch prices" });
  }
});

// Get all prices for price comparison
router.get("/comparison/all", async (req, res) => {
  try {
    const { sellerPricesCollection } = await connectDB();
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const prices = await sellerPricesCollection
      .find({
        date: { $gte: fiveDaysAgo },
      })
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    // Group by material and limit to 5 latest per seller per material
    const groupedPrices = {};
    const sellerMaterialCount = {};
    
    prices.forEach((price) => {
      if (!groupedPrices[price.material]) {
        groupedPrices[price.material] = [];
      }
      
      // Track how many prices we have for each seller/material combo
      const key = `${price.sellerId}-${price.material}`;
      if (!sellerMaterialCount[key]) {
        sellerMaterialCount[key] = 0;
      }
      
      // Only add if we have less than 5 prices for this seller/material
      if (sellerMaterialCount[key] < 5) {
        groupedPrices[price.material].push(price);
        sellerMaterialCount[key]++;
      }
    });

    res.json(groupedPrices);
  } catch (err) {
    console.error("Error fetching prices for comparison:", err);
    res.status(500).json({ error: "Failed to fetch prices" });
  }
});

module.exports = router;
