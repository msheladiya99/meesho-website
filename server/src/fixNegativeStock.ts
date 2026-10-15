/**
 * Fix negative stock values in the database
 * Run: npx tsx src/fixNegativeStock.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { Product } from './models/Product';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/perfume_business';

async function fixNegativeStock() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Find all products with negative stock
  const negativeStockProducts = await Product.find({ currentStock: { $lt: 0 } });
  console.log(`📦 Found ${negativeStockProducts.length} products with negative stock:`);

  for (const product of negativeStockProducts) {
    console.log(`  - ${product.name} (${product.sku}): ${product.currentStock}`);
  }

  // Reset all negative stock to 0
  const result = await Product.updateMany(
    { currentStock: { $lt: 0 } },
    { currentStock: 0 }
  );

  console.log(`\n✅ Fixed ${result.modifiedCount} products. Stock reset to 0.`);

  await mongoose.disconnect();
}

fixNegativeStock().catch(err => {
  console.error('Fix failed:', err?.message || err);
  console.error('Stack:', err?.stack);
  process.exit(1);
});
