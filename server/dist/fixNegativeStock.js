"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Fix negative stock values in the database
 * Run: npx tsx src/fixNegativeStock.ts
 */
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const mongoose_1 = __importDefault(require("mongoose"));
const Product_1 = require("./models/Product");
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/perfume_business';
async function fixNegativeStock() {
    await mongoose_1.default.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    // Find all products with negative stock
    const negativeStockProducts = await Product_1.Product.find({ currentStock: { $lt: 0 } });
    console.log(`📦 Found ${negativeStockProducts.length} products with negative stock:`);
    for (const product of negativeStockProducts) {
        console.log(`  - ${product.name} (${product.sku}): ${product.currentStock}`);
    }
    // Reset all negative stock to 0
    const result = await Product_1.Product.updateMany({ currentStock: { $lt: 0 } }, { currentStock: 0 });
    console.log(`\n✅ Fixed ${result.modifiedCount} products. Stock reset to 0.`);
    await mongoose_1.default.disconnect();
}
fixNegativeStock().catch(err => {
    console.error('Fix failed:', err?.message || err);
    console.error('Stack:', err?.stack);
    process.exit(1);
});
//# sourceMappingURL=fixNegativeStock.js.map