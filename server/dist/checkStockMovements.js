"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Check stock movements for a specific product to debug duplication issues
 * Run: npx tsx src/checkStockMovements.ts <productId>
 */
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const mongoose_1 = __importDefault(require("mongoose"));
const Product_1 = require("./models/Product");
const StockMovement_1 = require("./models/StockMovement");
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/perfume_business';
async function checkStock(productId) {
    await mongoose_1.default.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    if (productId) {
        // Check specific product
        const product = await Product_1.Product.findById(productId);
        if (!product) {
            console.log('Product not found');
            await mongoose_1.default.disconnect();
            return;
        }
        console.log(`\n📦 Product: ${product.name} (${product.sku})`);
        console.log(`   Current Stock: ${product.currentStock}`);
        console.log(`   Weighted Avg Cost: ${product.weightedAvgCost}`);
        const movements = await StockMovement_1.StockMovement.find({ product: new mongoose_1.default.Types.ObjectId(productId) })
            .populate('referenceType')
            .sort({ createdAt: 1 });
        console.log(`\n📊 Stock Movements (${movements.length} total):`);
        let runningBalance = 0;
        for (const mv of movements) {
            runningBalance += mv.quantity;
            const createdDate = mv.createdAt ? mv.createdAt.toISOString().split('T')[0] : '';
            console.log(`   ${createdDate} | ${mv.movementType.padEnd(12)} | Qty: ${mv.quantity.toString().padStart(4)} | Running: ${runningBalance} | Ref: ${mv.referenceType || 'N/A'} | ${mv.reason || ''}`);
        }
    }
    else {
        // List all products with their stock
        const products = await Product_1.Product.find({});
        console.log(`\n📦 All Products (${products.length} total):`);
        for (const product of products) {
            const movementCount = await StockMovement_1.StockMovement.countDocuments({ product: product._id });
            console.log(`   ${product.name.padEnd(30)} | Stock: ${product.currentStock.toString().padStart(4)} | Movements: ${movementCount}`);
        }
    }
    await mongoose_1.default.disconnect();
}
const productId = process.argv[2];
checkStock(productId).catch(err => {
    console.error('Check failed:', err?.message || err);
    console.error('Stack:', err?.stack);
    process.exit(1);
});
//# sourceMappingURL=checkStockMovements.js.map