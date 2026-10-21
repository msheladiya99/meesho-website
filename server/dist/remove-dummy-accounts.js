"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Script to remove dummy "Royal Fragrance A" and "Royal Fragrance B" accounts
 * that were created by the test module (test-module11.ts).
 * Run: npx ts-node src/remove-dummy-accounts.ts
 */
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const mongoose_1 = __importDefault(require("mongoose"));
const BusinessAccount_1 = require("./models/BusinessAccount");
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/perfume_business';
async function removeDummyAccounts() {
    await mongoose_1.default.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    // These are the dummy GSTINs created by test-module11.ts
    const dummyGstins = ['24AAACT1111A1Z1', '27AAACT2222B1Z2'];
    const result = await BusinessAccount_1.BusinessAccount.deleteMany({ gstin: { $in: dummyGstins } });
    if (result.deletedCount > 0) {
        console.log(`🗑  Removed ${result.deletedCount} dummy account(s): Royal Fragrance A & Royal Fragrance B`);
    }
    else {
        console.log('ℹ️  No dummy accounts found (already removed or never created).');
    }
    // Confirm remaining accounts
    const remaining = await BusinessAccount_1.BusinessAccount.find({}, { name: 1, tradeName: 1, gstin: 1 });
    console.log('\n📋 Remaining business accounts:');
    remaining.forEach((acc) => {
        console.log(`  - ${acc.tradeName || acc.name} (${acc.gstin})`);
    });
    await mongoose_1.default.disconnect();
    console.log('\n✅ Done!');
}
removeDummyAccounts().catch((err) => {
    console.error('Failed:', err?.message || err);
    process.exit(1);
});
//# sourceMappingURL=remove-dummy-accounts.js.map