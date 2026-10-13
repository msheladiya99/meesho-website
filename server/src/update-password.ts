import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { User } from './models/User';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/perfume_business';

async function updateAdminPassword() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const admin = await User.findOne({ email: 'admin@perfume.com' });
  if (!admin) {
    console.log('❌ Admin user not found');
    await mongoose.disconnect();
    process.exit(1);
  }

  admin.password = 'admin125';
  await admin.save();
  console.log('✅ Admin password updated to: admin125');

  await mongoose.disconnect();
  console.log('✅ Disconnected from MongoDB');
}

updateAdminPassword().catch(err => {
  console.error('❌ Error:', err?.message || err);
  process.exit(1);
});
