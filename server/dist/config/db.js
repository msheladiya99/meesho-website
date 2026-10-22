"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeDB = exports.connectDB = exports.isDbConnected = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Order_1 = require("../models/Order");
let isConnected = false;
let connectionAttempts = 0;
const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 5000;
const isDbConnected = () => {
    return mongoose_1.default.connection.readyState === 1;
};
exports.isDbConnected = isDbConnected;
const connectDB = async () => {
    if ((0, exports.isDbConnected)()) {
        console.log('⚡ Using existing MongoDB connection');
        return true;
    }
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/perfume_business';
    const options = {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 10000, // 10s timeout instead of 30s default
        socketTimeoutMS: 45000,
        family: 4, // Use IPv4 for fast DNS resolution
    };
    // Register connection lifecycle listeners once
    if (mongoose_1.default.connection.listenerCount('connected') === 0) {
        mongoose_1.default.connection.on('connected', () => {
            isConnected = true;
            connectionAttempts = 0;
            console.log('✅ MongoDB connected successfully');
        });
        mongoose_1.default.connection.on('error', (err) => {
            isConnected = false;
            console.error('❌ MongoDB connection error:', err.message);
        });
        mongoose_1.default.connection.on('disconnected', () => {
            isConnected = false;
            console.warn('⚠️ MongoDB disconnected. Mongoose will attempt auto-reconnect.');
        });
        mongoose_1.default.connection.on('reconnected', () => {
            isConnected = true;
            console.log('🔄 MongoDB reconnected');
        });
    }
    try {
        const conn = await mongoose_1.default.connect(uri, options);
        isConnected = true;
        console.log(`✅ MongoDB connected to host: ${conn.connection.host}`);
        // Sync critical indexes in the background without blocking boot
        Order_1.Order.syncIndexes()
            .then(() => console.log('✅ Order indexes synchronized'))
            .catch((idxErr) => console.warn('⚠️ Order indexes sync notice:', idxErr.message));
        return true;
    }
    catch (error) {
        isConnected = false;
        connectionAttempts++;
        console.error(`❌ MongoDB initial connection failed (Attempt ${connectionAttempts}/${MAX_RETRIES}):`, error.message);
        if (connectionAttempts < MAX_RETRIES) {
            console.log(`⏳ Retrying MongoDB connection in ${RETRY_INTERVAL_MS / 1000}s...`);
            setTimeout(() => {
                (0, exports.connectDB)();
            }, RETRY_INTERVAL_MS);
        }
        else {
            console.error('🚨 Max MongoDB connection retries exceeded. The server remains online to serve health probes and will retry on request.');
        }
        return false;
    }
};
exports.connectDB = connectDB;
const closeDB = async () => {
    if (mongoose_1.default.connection.readyState !== 0) {
        try {
            await mongoose_1.default.connection.close(false);
            isConnected = false;
            console.log('🔌 MongoDB connection closed cleanly');
        }
        catch (err) {
            console.error('Error closing MongoDB connection:', err);
        }
    }
};
exports.closeDB = closeDB;
//# sourceMappingURL=db.js.map