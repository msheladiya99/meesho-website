/**
 * Seed the database with initial data:
 *  - Admin user
 *  - 2 GSTIN business accounts
 *  - 3 partners
 *  - Sample categories, products, vendors
 * Run: npm run seed
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { User } from './models/User';
import { BusinessAccount } from './models/BusinessAccount';
import { Partner } from './models/Partner';
import { Category } from './models/Category';
import { Product } from './models/Product';
import { Vendor } from './models/Vendor';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/perfume_business';

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Clear collections
  await Promise.all([
    User.deleteMany({}),
    BusinessAccount.deleteMany({}),
    Partner.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Vendor.deleteMany({}),
  ]);
  console.log('🗑  Cleared existing data');

  // Business Accounts
  const [acc1, acc2] = await BusinessAccount.insertMany([
    { name: 'Account A', tradeName: 'Aroma Essentials', gstin: '27AABCU9603R1ZM', address: 'Mumbai, MH', phone: '9876543210', email: 'aromaa@example.com', isActive: true },
    { name: 'Account B', tradeName: 'Scent Studio', gstin: '29AABCU9603R1ZP', address: 'Bangalore, KA', phone: '9876543211', email: 'scentb@example.com', isActive: true },
  ]);
  console.log('🏢 Created 2 business accounts');

  // Admin user
  const admin = await User.create({
    name: 'Admin User',
    email: 'admin@perfume.com',
    password: 'admin125',
    role: 'admin',
    allowedAccounts: [acc1._id, acc2._id],
    isActive: true,
  });
  // Manager
  await User.create({
    name: 'Manager',
    email: 'manager@perfume.com',
    password: 'manager123',
    role: 'manager',
    allowedAccounts: [acc1._id],
    isActive: true,
  });
  // Viewer
  await User.create({
    name: 'Viewer',
    email: 'viewer@perfume.com',
    password: 'viewer123',
    role: 'viewer',
    allowedAccounts: [acc1._id, acc2._id],
    isActive: true,
  });
  console.log('👥 Created 3 users (admin, manager, viewer)');

  // Partners
  await Partner.insertMany([
    { name: 'Rahul Sharma', email: 'rahul@example.com', phone: '9800000001', profitSharePercent: 40, capitalContributed: 50000_00, isActive: true },
    { name: 'Priya Patel', email: 'priya@example.com', phone: '9800000002', profitSharePercent: 35, capitalContributed: 35000_00, isActive: true },
    { name: 'Amit Singh', email: 'amit@example.com', phone: '9800000003', profitSharePercent: 25, capitalContributed: 25000_00, isActive: true },
  ]);
  console.log('🤝 Created 3 partners');

  // Categories
  const [floral, woody, fresh, oriental, citrus] = await Category.insertMany([
    { name: 'Floral', description: 'Rose, jasmine, lavender etc.', isActive: true },
    { name: 'Woody', description: 'Oud, sandalwood, cedar etc.', isActive: true },
    { name: 'Fresh', description: 'Aquatic, green, ozonic', isActive: true },
    { name: 'Oriental', description: 'Musk, amber, spicy', isActive: true },
    { name: 'Citrus', description: 'Lemon, bergamot, orange', isActive: true },
  ]);
  console.log('🏷  Created 5 categories');

  // Products
  await Product.insertMany([
    { name: 'Rose Bloom EDP', sku: 'PF-ROSE-50', category: floral._id, sizeml: 50, fragranceType: 'EDP', brand: 'Aroma House', sellingPrice: 299_00, defaultPurchaseCost: 120_00, weightedAvgCost: 120_00, reorderThreshold: 10, currentStock: 85 },
    { name: 'Jasmine Nights EDP', sku: 'PF-JASM-100', category: floral._id, sizeml: 100, fragranceType: 'EDP', brand: 'Aroma House', sellingPrice: 499_00, defaultPurchaseCost: 200_00, weightedAvgCost: 200_00, reorderThreshold: 8, currentStock: 42 },
    { name: 'Oud Royal EDP', sku: 'PF-OUD-50', category: woody._id, sizeml: 50, fragranceType: 'EDP', brand: 'Scent Studio', sellingPrice: 599_00, defaultPurchaseCost: 280_00, weightedAvgCost: 280_00, reorderThreshold: 5, currentStock: 28 },
    { name: 'Sandalwood Dreams EDT', sku: 'PF-SAND-100', category: woody._id, sizeml: 100, fragranceType: 'EDT', brand: 'Scent Studio', sellingPrice: 449_00, defaultPurchaseCost: 190_00, weightedAvgCost: 190_00, reorderThreshold: 8, currentStock: 3 },
    { name: 'Ocean Breeze EDT', sku: 'PF-OCEN-100', category: fresh._id, sizeml: 100, fragranceType: 'EDT', brand: 'Aroma House', sellingPrice: 349_00, defaultPurchaseCost: 150_00, weightedAvgCost: 150_00, reorderThreshold: 10, currentStock: 60 },
    { name: 'Amber Noir EDP', sku: 'PF-AMBN-50', category: oriental._id, sizeml: 50, fragranceType: 'EDP', brand: 'Scent Studio', sellingPrice: 699_00, defaultPurchaseCost: 320_00, weightedAvgCost: 320_00, reorderThreshold: 5, currentStock: 0 },
    { name: 'Citrus Burst EDT', sku: 'PF-CITS-100', category: citrus._id, sizeml: 100, fragranceType: 'EDT', brand: 'Aroma House', sellingPrice: 299_00, defaultPurchaseCost: 110_00, weightedAvgCost: 110_00, reorderThreshold: 12, currentStock: 95 },
    { name: 'Musk & Amber EDP', sku: 'PF-MUAM-50', category: oriental._id, sizeml: 50, fragranceType: 'EDP', brand: 'Scent Studio', sellingPrice: 549_00, defaultPurchaseCost: 240_00, weightedAvgCost: 240_00, reorderThreshold: 5, currentStock: 22 },
  ]);
  console.log('🧴 Created 8 products');

  // Vendors
  await Vendor.insertMany([
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

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err?.message || err);
  console.error('Stack:', err?.stack);
  process.exit(1);
});

