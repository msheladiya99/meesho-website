import mongoose from 'mongoose';
import { Order } from '../models/Order';

let isConnected = false;
let connectionAttempts = 0;
const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 5000;

export const isDbConnected = (): boolean => {
  return mongoose.connection.readyState === 1;
};

export const connectDB = async (): Promise<boolean> => {
  if (isDbConnected()) {
    console.log('⚡ Using existing MongoDB connection');
    return true;
  }

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/perfume_business';

  const options: mongoose.ConnectOptions = {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10000, // 10s timeout instead of 30s default
    socketTimeoutMS: 45000,
    family: 4, // Use IPv4 for fast DNS resolution
  };

  // Register connection lifecycle listeners once
  if (mongoose.connection.listenerCount('connected') === 0) {
    mongoose.connection.on('connected', () => {
      isConnected = true;
      connectionAttempts = 0;
      console.log('✅ MongoDB connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      isConnected = false;
      console.error('❌ MongoDB connection error:', (err as Error).message);
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('⚠️ MongoDB disconnected. Mongoose will attempt auto-reconnect.');
    });

    mongoose.connection.on('reconnected', () => {
      isConnected = true;
      console.log('🔄 MongoDB reconnected');
    });
  }

  try {
    const conn = await mongoose.connect(uri, options);
    isConnected = true;
    console.log(`✅ MongoDB connected to host: ${conn.connection.host}`);

    // Sync critical indexes in the background without blocking boot
    Order.syncIndexes()
      .then(() => console.log('✅ Order indexes synchronized'))
      .catch((idxErr) => console.warn('⚠️ Order indexes sync notice:', (idxErr as Error).message));

    return true;
  } catch (error) {
    isConnected = false;
    connectionAttempts++;
    console.error(`❌ MongoDB initial connection failed (Attempt ${connectionAttempts}/${MAX_RETRIES}):`, (error as Error).message);

    if (connectionAttempts < MAX_RETRIES) {
      console.log(`⏳ Retrying MongoDB connection in ${RETRY_INTERVAL_MS / 1000}s...`);
      setTimeout(() => {
        connectDB();
      }, RETRY_INTERVAL_MS);
    } else {
      console.error('🚨 Max MongoDB connection retries exceeded. The server remains online to serve health probes and will retry on request.');
    }
    return false;
  }
};

export const closeDB = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.close(false);
      isConnected = false;
      console.log('🔌 MongoDB connection closed cleanly');
    } catch (err) {
      console.error('Error closing MongoDB connection:', err);
    }
  }
};
