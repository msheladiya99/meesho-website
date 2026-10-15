"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("./models/User");
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/perfume_business';
async function updateAdminPassword() {
    await mongoose_1.default.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    const admin = await User_1.User.findOne({ email: 'admin@perfume.com' });
    if (!admin) {
        console.log('❌ Admin user not found');
        await mongoose_1.default.disconnect();
        process.exit(1);
    }
    admin.password = 'admin125';
    await admin.save();
    console.log('✅ Admin password updated to: admin125');
    await mongoose_1.default.disconnect();
    console.log('✅ Disconnected from MongoDB');
}
updateAdminPassword().catch(err => {
    console.error('❌ Error:', err?.message || err);
    process.exit(1);
});
//# sourceMappingURL=update-password.js.map