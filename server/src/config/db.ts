import mongoose from 'mongoose';
import { Order } from '../models/Order';

export const connectDB = async (): Promise<void> => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/perfume_business';
    const conn = await mongoose.connect(uri);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    try {
      await Order.syncIndexes();
      console.log('✅ Order unique indexes synchronized');
    } catch (idxErr) {
      console.warn('⚠️ Order indexes sync notice:', (idxErr as Error).message);
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};
