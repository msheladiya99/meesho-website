"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Seed the database with initial data:
 *  - Admin user
 *  - 2 GSTIN business accounts
 *  - 3 partners
 *  - Sample categories, products, vendors
 * Run: npm run seed
 */
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("./models/User");
const BusinessAccount_1 = require("./models/BusinessAccount");
const Partner_1 = require("./models/Partner");
const Category_1 = require("./models/Category");
const Product_1 = require("./models/Product");
const Vendor_1 = require("./models/Vendor");
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/perfume_business';
async function seed() {
    await mongoose_1.default.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    // Clear collections
    await Promise.all([
        User_1.User.deleteMany({}),
        BusinessAccount_1.BusinessAccount.deleteMany({}),
        Partner_1.Partner.deleteMany({}),
        Category_1.Category.deleteMany({}),
        Product_1.Product.deleteMany({}),
        Vendor_1.Vendor.deleteMany({}),
    ]);
    console.log('🗑  Cleared existing data');
    // Business Accounts
    const [acc1, acc2] = await BusinessAccount_1.BusinessAccount.insertMany([
        { name: 'Account A', tradeName: 'Aroma Essentials', gstin: '27AABCU9603R1ZM', address: 'Mumbai, MH', phone: '9876543210', email: 'aromaa@example.com', isActive: true },
        { name: 'Account B', tradeName: 'Scent Studio', gstin: '29AABCU9603R1ZP', address: 'Bangalore, KA', phone: '9876543211', email: 'scentb@example.com', isActive: true },
    ]);
    console.log('🏢 Created 2 business accounts');
    // Admin user
    const admin = await User_1.User.create({
        name: 'Admin User',
        email: 'admin@perfume.com',
        password: 'admin125',
        role: 'admin',
        allowedAccounts: [acc1._id, acc2._id],
        isActive: true,
    });
    // Manager
    await User_1.User.create({
        name: 'Manager',
        email: 'manager@perfume.com',
        password: 'manager123',
        role: 'manager',
        allowedAccounts: [acc1._id],
        isActive: true,
    });
    // Viewer
    await User_1.User.create({
        name: 'Viewer',
        email: 'viewer@perfume.com',
        password: 'viewer123',
        role: 'viewer',
        allowedAccounts: [acc1._id, acc2._id],
        isActive: true,
    });
    console.log('👥 Created 3 users (admin, manager, viewer)');
    // Partners
    await Partner_1.Partner.insertMany([
        { name: 'Rahul Sharma', email: 'rahul@example.com', phone: '9800000001', profitSharePercent: 40, capitalContributed: 5000000, isActive: true },
        { name: 'Priya Patel', email: 'priya@example.com', phone: '9800000002', profitSharePercent: 35, capitalContributed: 3500000, isActive: true },
        { name: 'Amit Singh', email: 'amit@example.com', phone: '9800000003', profitSharePercent: 25, capitalContributed: 2500000, isActive: true },
    ]);
    console.log('🤝 Created 3 partners');
    // Categories
    const [floral, woody, fresh, oriental, citrus] = await Category_1.Category.insertMany([
        { name: 'Floral', description: 'Rose, jasmine, lavender etc.', isActive: true },
        { name: 'Woody', description: 'Oud, sandalwood, cedar etc.', isActive: true },
        { name: 'Fresh', description: 'Aquatic, green, ozonic', isActive: true },
        { name: 'Oriental', description: 'Musk, amber, spicy', isActive: true },
        { name: 'Citrus', description: 'Lemon, bergamot, orange', isActive: true },
    ]);
    console.log('🏷  Created 5 categories');
    // Products
    await Product_1.Product.insertMany([
        { name: 'Rose Bloom EDP', sku: 'PF-ROSE-50', category: floral._id, sizeml: 50, fragranceType: 'EDP', brand: 'Aroma House', sellingPrice: 29900, defaultPurchaseCost: 12000, weightedAvgCost: 12000, reorderThreshold: 10, currentStock: 85 },
        { name: 'Jasmine Nights EDP', sku: 'PF-JASM-100', category: floral._id, sizeml: 100, fragranceType: 'EDP', brand: 'Aroma House', sellingPrice: 49900, defaultPurchaseCost: 20000, weightedAvgCost: 20000, reorderThreshold: 8, currentStock: 42 },
        { name: 'Oud Royal EDP', sku: 'PF-OUD-50', category: woody._id, sizeml: 50, fragranceType: 'EDP', brand: 'Scent Studio', sellingPrice: 59900, defaultPurchaseCost: 28000, weightedAvgCost: 28000, reorderThreshold: 5, currentStock: 28 },
        { name: 'Sandalwood Dreams EDT', sku: 'PF-SAND-100', category: woody._id, sizeml: 100, fragranceType: 'EDT', brand: 'Scent Studio', sellingPrice: 44900, defaultPurchaseCost: 19000, weightedAvgCost: 19000, reorderThreshold: 8, currentStock: 3 },
        { name: 'Ocean Breeze EDT', sku: 'PF-OCEN-100', category: fresh._id, sizeml: 100, fragranceType: 'EDT', brand: 'Aroma House', sellingPrice: 34900, defaultPurchaseCost: 15000, weightedAvgCost: 15000, reorderThreshold: 10, currentStock: 60 },
        { name: 'Amber Noir EDP', sku: 'PF-AMBN-50', category: oriental._id, sizeml: 50, fragranceType: 'EDP', brand: 'Scent Studio', sellingPrice: 69900, defaultPurchaseCost: 32000, weightedAvgCost: 32000, reorderThreshold: 5, currentStock: 0 },
        { name: 'Citrus Burst EDT', sku: 'PF-CITS-100', category: citrus._id, sizeml: 100, fragranceType: 'EDT', brand: 'Aroma House', sellingPrice: 29900, defaultPurchaseCost: 11000, weightedAvgCost: 11000, reorderThreshold: 12, currentStock: 95 },
        { name: 'Musk & Amber EDP', sku: 'PF-MUAM-50', category: oriental._id, sizeml: 50, fragranceType: 'EDP', brand: 'Scent Studio', sellingPrice: 54900, defaultPurchaseCost: 24000, weightedAvgCost: 24000, reorderThreshold: 5, currentStock: 22 },
    ]);
    console.log('🧴 Created 8 products');
    // Vendors
    await Vendor_1.Vendor.insertMany([
        { name: 'Mohammad Rafi', company: 'Rafi Fragrances', phone: '9700000001', email: 'rafi@fragrances.com', address: 'Kannauj, UP', gstin: '09AABCU9603R1ZQ', isActive: true },
        { name: 'Suresh Kumar', company: 'SK Perfumes Wholesale', phone: '9700000002', email: 'sk@wholesale.com', address: 'Delhi', isActive: true },
        { name: 'Fatima Exports', company: 'Fatima Int. Exports', phone: '9700000003', email: 'fatima@exports.com', address: 'Lucknow, UP', isActive: true },
    ]);
    console.log('🚚 Created 3 vendors');
    console.log('\n🎉 Seed complete!\n');
    console.log('Login credentials:');
    console.log('  Admin:   admin@perfume.com   / admin125');
    console.log('  Manager: manager@perfume.com / manager123');
    console.log('  Viewer:  viewer@perfume.com  / viewer123\n');
    await mongoose_1.default.disconnect();
}
seed().catch(err => {
    console.error('Seed failed:', err?.message || err);
    console.error('Stack:', err?.stack);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map