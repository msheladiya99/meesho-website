"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Order_1 = require("../models/Order");
const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/perfume_business';
        const conn = await mongoose_1.default.connect(uri);
        console.log(`✅ MongoDB connected: ${conn.connection.host}`);
        try {
            await Order_1.Order.syncIndexes();
            console.log('✅ Order unique indexes synchronized');
        }
        catch (idxErr) {
            console.warn('⚠️ Order indexes sync notice:', idxErr.message);
        }
    }
    catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};
exports.connectDB = connectDB;
//# sourceMappingURL=db.js.map