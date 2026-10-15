/**
 * Check stock movements for a specific product to debug duplication issues
 * Run: npx tsx src/checkStockMovements.ts <productId>
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { Product } from './models/Product';
import { StockMovement } from './models/StockMovement';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/perfume_business';

async function checkStock(productId?: string) {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  if (productId) {
    // Check specific product
    const product = await Product.findById(productId);
    if (!product) {
      console.log('Product not found');
      await mongoose.disconnect();
      return;
    }

    console.log(`\n📦 Product: ${product.name} (${product.sku})`);
    console.log(`   Current Stock: ${product.currentStock}`);
    console.log(`   Weighted Avg Cost: ${product.weightedAvgCost}`);

    const movements = await StockMovement.find({ product: new mongoose.Types.ObjectId(productId) })
      .populate('referenceType')
      .sort({ createdAt: 1 });

    console.log(`\n📊 Stock Movements (${movements.length} total):`);
    let runningBalance = 0;
    for (const mv of movements) {
      runningBalance += mv.quantity;
      console.log(`   ${mv.createdAt?.toISOString().split('T')[0]} | ${mv.movementType.padEnd(12)} | Qty: ${mv.quantity.toString().padStart(4)} | Running: ${runningBalance} | Ref: ${mv.referenceType || 'N/A'} | ${mv.reason || ''}`);
    }
  } else {
    // List all products with their stock
    const products = await Product.find({});
    console.log(`\n📦 All Products (${products.length} total):`);
    for (const product of products) {
      const movementCount = await StockMovement.countDocuments({ product: product._id });
      console.log(`   ${product.name.padEnd(30)} | Stock: ${product.currentStock.toString().padStart(4)} | Movements: ${movementCount}`);
    }
  }

  await mongoose.disconnect();
}

const productId = process.argv[2];
checkStock(productId).catch(err => {
  console.error('Check failed:', err?.message || err);
  console.error('Stack:', err?.stack);
  process.exit(1);
});
