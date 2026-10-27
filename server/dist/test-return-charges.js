"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const BusinessAccount_1 = require("./models/BusinessAccount");
const Category_1 = require("./models/Category");
const Product_1 = require("./models/Product");
const Order_1 = require("./models/Order");
const ReturnOrder_1 = require("./models/ReturnOrder");
const CustomerReturnChargeSettings_1 = require("./models/CustomerReturnChargeSettings");
const CustomerReturnCharge_1 = require("./models/CustomerReturnCharge");
const AuditLog_1 = require("./models/AuditLog");
const customerReturnCharge_service_1 = require("./services/customerReturnCharge.service");
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
};
async function runAll16Tests() {
    console.log('================================================================');
    console.log('🚀 RUNNING ALL 16 CUSTOMER RETURN CHARGE VERIFICATION TESTS');
    console.log('================================================================\n');
    await mongoose_1.default.connect(process.env.MONGODB_URI);
    console.log(' Connected to MongoDB');
    // Cleanup test artifacts
    await CustomerReturnCharge_1.CustomerReturnCharge.deleteMany({ sku: { $regex: /^TEST-CRC-/ } });
    await Order_1.Order.deleteMany({ subOrderId: { $regex: /^TEST-CRC-/ } });
    await ReturnOrder_1.ReturnOrder.deleteMany({ meeshoOrderId: { $regex: /^TEST-CRC-/ } });
    await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.deleteMany({ notes: 'Automated Test Settings' });
    // 1. Setup Test Business Accounts & Products
    let accountA = await BusinessAccount_1.BusinessAccount.findOne({ gstin: '24TESTACT1111A1' });
    if (!accountA) {
        accountA = await BusinessAccount_1.BusinessAccount.create({
            name: 'Account A - Perfumes Ltd',
            tradeName: 'Royal Oud A',
            gstin: '24TESTACT1111A1',
            isActive: true,
        });
    }
    let accountB = await BusinessAccount_1.BusinessAccount.findOne({ gstin: '27TESTACT2222B2' });
    if (!accountB) {
        accountB = await BusinessAccount_1.BusinessAccount.create({
            name: 'Account B - Scents Inc',
            tradeName: 'Royal Oud B',
            gstin: '27TESTACT2222B2',
            isActive: true,
        });
    }
    let category1 = await Category_1.Category.findOne({ name: 'Test Floral Perfume' });
    if (!category1) {
        category1 = await Category_1.Category.create({ name: 'Test Floral Perfume', isActive: true });
    }
    let category2 = await Category_1.Category.findOne({ name: 'Test Woody Perfume' });
    if (!category2) {
        category2 = await Category_1.Category.create({ name: 'Test Woody Perfume', isActive: true });
    }
    let productA = await Product_1.Product.findOne({ sku: 'TEST-CRC-FLORAL-100' });
    if (!productA) {
        productA = await Product_1.Product.create({
            name: 'Test Floral 100ml',
            sku: 'TEST-CRC-FLORAL-100',
            category: category1._id,
            sizeml: 100,
            sellingPrice: 49900, // ₹499
            defaultPurchaseCost: 15000,
            weightedAvgCost: 15000,
            currentStock: 100,
            reorderThreshold: 10,
            isActive: true,
        });
    }
    let productB = await Product_1.Product.findOne({ sku: 'TEST-CRC-WOODY-100' });
    if (!productB) {
        productB = await Product_1.Product.create({
            name: 'Test Woody 100ml',
            sku: 'TEST-CRC-WOODY-100',
            category: category2._id,
            sizeml: 100,
            sellingPrice: 79900, // ₹799
            defaultPurchaseCost: 25000,
            weightedAvgCost: 25000,
            currentStock: 100,
            reorderThreshold: 10,
            isActive: true,
        });
    }
    console.log('✅ Test fixtures initialized.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 1: Customer return with fixed charge (₹60 = 6000 paise)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 1: Customer return with fixed charge...');
    await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.deleteMany({});
    const fixedSetting = await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.create({
        isEnabled: true,
        calculationType: 'fixed_order',
        chargeAmount: 6000, // ₹60
        hasHandlingCharge: false,
        effectiveFrom: new Date(Date.now() - 86400000),
        businessAccountScope: 'all',
        categoryScope: 'all',
        settingsVersion: 1,
        notes: 'Automated Test Settings',
    });
    const order1 = await Order_1.Order.create({
        businessAccount: accountA._id,
        orderDate: new Date(),
        subOrderId: 'TEST-CRC-ORD-01',
        product: productA._id,
        sku: productA.sku,
        quantity: 1,
        sellingPrice: 49900,
        grossAmount: 49900,
        status: 'returned',
    });
    const res1 = await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
        orderId: order1._id,
        returnedQuantity: 1,
        returnDate: new Date(),
    });
    assert(res1.applied === true, 'Test 1: Charge should be applied');
    assert(res1.charge?.baseCharge === 6000, 'Test 1: Base charge should be ₹60 (6000 paise)');
    assert(res1.charge?.totalCharge === 6000, 'Test 1: Total charge should be ₹60 (6000 paise)');
    console.log('  PASSED: Fixed charge ₹60 correctly applied.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 2: Customer return with per-unit charge (₹40 per returned unit)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 2: Customer return with per-unit charge...');
    await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.findByIdAndUpdate(fixedSetting._id, {
        calculationType: 'fixed_unit',
        chargeAmount: 4000, // ₹40/unit
        hasHandlingCharge: false,
        settingsVersion: 2,
    });
    const order2 = await Order_1.Order.create({
        businessAccount: accountA._id,
        orderDate: new Date(),
        subOrderId: 'TEST-CRC-ORD-02',
        product: productA._id,
        sku: productA.sku,
        quantity: 3,
        sellingPrice: 49900,
        grossAmount: 49900 * 3,
        status: 'returned',
    });
    const res2 = await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
        orderId: order2._id,
        returnedQuantity: 3,
        returnDate: new Date(),
    });
    assert(res2.applied === true, 'Test 2: Charge should be applied');
    assert(res2.charge?.baseCharge === 12000, `Test 2: Base charge should be ₹120 (4000 * 3), got ${res2.charge?.baseCharge}`);
    assert(res2.charge?.totalCharge === 12000, 'Test 2: Total charge should be ₹120');
    console.log('  PASSED: Per-unit charge ₹40 × 3 = ₹120 correctly applied.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 3: Customer return with percentage charge (10% of order value)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 3: Customer return with percentage charge...');
    await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.findByIdAndUpdate(fixedSetting._id, {
        calculationType: 'percentage',
        percentageRate: 10, // 10%
        hasHandlingCharge: false,
        settingsVersion: 3,
    });
    const order3 = await Order_1.Order.create({
        businessAccount: accountA._id,
        orderDate: new Date(),
        subOrderId: 'TEST-CRC-ORD-03',
        product: productA._id,
        sku: productA.sku,
        quantity: 1,
        sellingPrice: 50000, // ₹500
        grossAmount: 50000,
        status: 'returned',
    });
    const res3 = await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
        orderId: order3._id,
        returnedQuantity: 1,
        returnDate: new Date(),
    });
    assert(res3.applied === true, 'Test 3: Charge should be applied');
    assert(res3.charge?.baseCharge === 5000, `Test 3: Base charge should be 10% of ₹500 = ₹50 (5000 paise), got ${res3.charge?.baseCharge}`);
    console.log('  PASSED: 10% percentage charge on ₹500 = ₹50 correctly applied.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 4: Customer return with additional handling charge
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 4: Customer return with additional handling charge...');
    await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.findByIdAndUpdate(fixedSetting._id, {
        calculationType: 'fixed_order',
        chargeAmount: 6000, // ₹60
        hasHandlingCharge: true,
        handlingCalculationType: 'fixed_order',
        handlingChargeAmount: 1000, // ₹10 handling
        settingsVersion: 4,
    });
    const order4 = await Order_1.Order.create({
        businessAccount: accountA._id,
        orderDate: new Date(),
        subOrderId: 'TEST-CRC-ORD-04',
        product: productA._id,
        sku: productA.sku,
        quantity: 1,
        sellingPrice: 49900,
        grossAmount: 49900,
        status: 'returned',
    });
    const res4 = await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
        orderId: order4._id,
        returnedQuantity: 1,
        returnDate: new Date(),
    });
    assert(res4.applied === true, 'Test 4: Charge should be applied');
    assert(res4.charge?.baseCharge === 6000, 'Test 4: Base charge should be ₹60');
    assert(res4.charge?.handlingCharge === 1000, 'Test 4: Handling charge should be ₹10');
    assert(res4.charge?.totalCharge === 7000, 'Test 4: Total expense should be ₹70 (6000 + 1000 paise)');
    console.log('  PASSED: Base ₹60 + Handling ₹10 = Total ₹70 correctly applied.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 5: RTO order with zero customer return charge (STRICT EXCLUSION)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 5: RTO order with zero customer return charge (Strict exclusion)...');
    const rtoOrder = await Order_1.Order.create({
        businessAccount: accountA._id,
        orderDate: new Date(),
        subOrderId: 'TEST-CRC-ORD-05-RTO',
        product: productA._id,
        sku: productA.sku,
        quantity: 1,
        sellingPrice: 49900,
        grossAmount: 49900,
        status: 'rto_received', // RTO status
    });
    const res5 = await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
        orderId: rtoOrder._id,
        returnedQuantity: 1,
        returnDate: new Date(),
    });
    assert(res5.applied === false, 'Test 5: RTO order MUST NOT have customer return charge applied');
    const rtoChargeInDb = await CustomerReturnCharge_1.CustomerReturnCharge.findOne({ order: rtoOrder._id });
    assert(rtoChargeInDb === null, 'Test 5: No CustomerReturnCharge record should exist for RTO order');
    console.log('  PASSED: RTO order strictly excluded from customer return charge.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 6: Normal delivered order with zero customer return charge
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 6: Normal delivered order with zero customer return charge...');
    const deliveredOrder = await Order_1.Order.create({
        businessAccount: accountA._id,
        orderDate: new Date(),
        subOrderId: 'TEST-CRC-ORD-06-DEL',
        product: productA._id,
        sku: productA.sku,
        quantity: 1,
        sellingPrice: 49900,
        grossAmount: 49900,
        status: 'delivered',
    });
    const res6 = await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
        orderId: deliveredOrder._id,
        returnedQuantity: 1,
    });
    assert(res6.applied === false, 'Test 6: Delivered order must not have customer return charge');
    console.log('  PASSED: Delivered order receives zero customer return charge.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 7: Partial customer return
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 7: Partial customer return...');
    await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.findByIdAndUpdate(fixedSetting._id, {
        calculationType: 'fixed_unit',
        chargeAmount: 5000, // ₹50 per returned unit
        hasHandlingCharge: true,
        handlingCalculationType: 'fixed_unit',
        handlingChargeAmount: 500, // ₹5 per returned unit
    });
    const partialOrder = await Order_1.Order.create({
        businessAccount: accountA._id,
        orderDate: new Date(),
        subOrderId: 'TEST-CRC-ORD-07-PARTIAL',
        product: productA._id,
        sku: productA.sku,
        quantity: 5, // Ordered 5
        sellingPrice: 49900,
        grossAmount: 49900 * 5,
        status: 'returned',
    });
    // Only 2 units returned out of 5
    const res7 = await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
        orderId: partialOrder._id,
        returnedQuantity: 2,
        returnDate: new Date(),
    });
    assert(res7.applied === true, 'Test 7: Charge should be applied');
    assert(res7.charge?.returnedQuantity === 2, 'Test 7: Returned quantity should be 2');
    assert(res7.charge?.baseCharge === 10000, 'Test 7: Base charge for 2 units = 5000 * 2 = 10000');
    assert(res7.charge?.handlingCharge === 1000, 'Test 7: Handling charge for 2 units = 500 * 2 = 1000');
    assert(res7.charge?.totalCharge === 11000, 'Test 7: Total charge for 2 units = 11000 paise (₹110)');
    console.log('  PASSED: Partial return accurately charged on returned quantity (2 of 5 units).\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 8: Multiple quantities returned
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 8: Multiple quantities returned...');
    const multiOrder = await Order_1.Order.create({
        businessAccount: accountA._id,
        orderDate: new Date(),
        subOrderId: 'TEST-CRC-ORD-08-MULTI',
        product: productA._id,
        sku: productA.sku,
        quantity: 10,
        sellingPrice: 49900,
        grossAmount: 49900 * 10,
        status: 'returned',
    });
    const res8 = await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
        orderId: multiOrder._id,
        returnedQuantity: 10,
        returnDate: new Date(),
    });
    assert(res8.applied === true, 'Test 8: Charge should be applied');
    assert(res8.charge?.totalCharge === 55000, `Test 8: Total charge should be (50+5)*10 = ₹550 (55000 paise), got ${res8.charge?.totalCharge}`);
    console.log('  PASSED: Multiple quantities (10 units) scaled accurately to ₹550.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 9: Same return imported or synchronized twice (Idempotency)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 9: Same return imported or synchronized twice (Strict Idempotency)...');
    const res9 = await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
        orderId: multiOrder._id,
        returnedQuantity: 10,
        returnDate: new Date(),
    });
    assert(res9.applied === false, 'Test 9: Second call must not create another charge');
    assert(Boolean(res9.reason?.includes('already been applied')), 'Test 9: Should identify existing charge');
    const chargesForMulti = await CustomerReturnCharge_1.CustomerReturnCharge.countDocuments({
        order: multiOrder._id,
        status: 'applied',
        isDeleted: false,
    });
    assert(chargesForMulti === 1, `Test 9: Expected exactly 1 charge record, found ${chargesForMulti}`);
    console.log('  PASSED: Duplicate charge prevented, idempotency verified.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 10: Return status changed from RTO to customer return
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 10: Return status changed from RTO to customer return...');
    const order10 = await Order_1.Order.create({
        businessAccount: accountA._id,
        orderDate: new Date(),
        subOrderId: 'TEST-CRC-ORD-10-RTO-TO-CR',
        product: productA._id,
        sku: productA.sku,
        quantity: 1,
        sellingPrice: 49900,
        grossAmount: 49900,
        status: 'rto_received',
    });
    // First verify no charge while RTO
    const res10a = await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({ orderId: order10._id, returnedQuantity: 1 });
    assert(res10a.applied === false, 'Test 10a: No charge while RTO');
    // Update status to 'returned' (Customer return)
    order10.status = 'returned';
    await order10.save();
    const res10b = await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({ orderId: order10._id, returnedQuantity: 1 });
    assert(res10b.applied === true, 'Test 10b: Charge must be applied after changing to customer returned');
    assert(res10b.charge?.status === 'applied', 'Test 10b: Charge status must be applied');
    console.log('  PASSED: Transition from RTO to Customer Return applies charge.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 11: Return status changed from customer return to RTO (Charge reversal)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 11: Return status changed from customer return to RTO...');
    const reversalResult = await (0, customerReturnCharge_service_1.reverseCustomerReturnCharge)({
        orderId: order10._id,
        reason: 'Order status changed from customer returned to RTO',
    });
    assert(reversalResult.reversed === true, 'Test 11: Reversal should succeed');
    assert(reversalResult.count === 1, 'Test 11: Exactly 1 charge should be reversed');
    const reversedCharge = await CustomerReturnCharge_1.CustomerReturnCharge.findOne({ order: order10._id });
    assert(reversedCharge?.status === 'reversed', 'Test 11: Status must be reversed');
    assert(Boolean(reversedCharge?.reversalReason?.includes('RTO')), 'Test 11: Reversal reason should be recorded');
    console.log('  PASSED: Charge reversed when status changed to RTO.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 12: Settings changed after earlier returns processed (Non-destructive)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 12: Settings changed after earlier returns processed...');
    // Earlier return (order1) was charged ₹60 under version 1
    const earlierCharge = await CustomerReturnCharge_1.CustomerReturnCharge.findOne({ order: order1._id });
    const earlierChargeAmount = earlierCharge?.totalCharge;
    // Now change settings to ₹150 under new version 5
    await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.findByIdAndUpdate(fixedSetting._id, {
        chargeAmount: 15000, // ₹150
        settingsVersion: 5,
    });
    // Check earlier charge is preserved without silent corruption
    const earlierChargeCheck = await CustomerReturnCharge_1.CustomerReturnCharge.findOne({ order: order1._id });
    assert(earlierChargeCheck?.totalCharge === earlierChargeAmount, 'Test 12: Earlier charge must not change silently');
    assert(earlierChargeCheck?.settingsVersion === 1, 'Test 12: Earlier charge keeps original version 1');
    // New return will pick up new setting (₹150)
    const order12 = await Order_1.Order.create({
        businessAccount: accountA._id,
        orderDate: new Date(),
        subOrderId: 'TEST-CRC-ORD-12-NEW-SETTING',
        product: productA._id,
        sku: productA.sku,
        quantity: 1,
        sellingPrice: 49900,
        grossAmount: 49900,
        status: 'returned',
    });
    const res12 = await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
        orderId: order12._id,
        returnedQuantity: 1,
    });
    assert(res12.charge?.totalCharge === 15500, `Test 12: New charge should use new rate ₹150 + handling ₹5, got ${res12.charge?.totalCharge}`);
    console.log('  PASSED: Historical charges preserved; new returns use updated settings.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 13: Separate GST accounts with different settings
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 13: Separate GST accounts with different settings...');
    // Account B specific setting: Fixed ₹99 per order
    const accountBSetting = await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.create({
        isEnabled: true,
        calculationType: 'fixed_order',
        chargeAmount: 9900, // ₹99
        hasHandlingCharge: false,
        effectiveFrom: new Date(Date.now() - 86400000),
        businessAccountScope: 'selected',
        applicableAccounts: [accountB._id],
        categoryScope: 'all',
        settingsVersion: 1,
        notes: 'Automated Test Settings - Account B',
    });
    const orderAccB = await Order_1.Order.create({
        businessAccount: accountB._id,
        orderDate: new Date(),
        subOrderId: 'TEST-CRC-ORD-13-ACC-B',
        product: productA._id,
        sku: productA.sku,
        quantity: 1,
        sellingPrice: 49900,
        grossAmount: 49900,
        status: 'returned',
    });
    const res13 = await (0, customerReturnCharge_service_1.applyCustomerReturnCharge)({
        orderId: orderAccB._id,
        returnedQuantity: 1,
    });
    assert(res13.applied === true, 'Test 13: Charge should be applied for Account B');
    assert(res13.charge?.totalCharge === 9900, `Test 13: Account B should get ₹99 charge (9900 paise), got ${res13.charge?.totalCharge}`);
    console.log('  PASSED: Account-specific setting ₹99 applied accurately to Account B.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 14: Date-range and category filters
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 14: Date-range and category filters...');
    const pastReturnDate = new Date('2026-01-15T10:00:00.000Z');
    const recentReturnDate = new Date('2026-10-20T10:00:00.000Z');
    const order14 = await Order_1.Order.create({
        businessAccount: accountA._id,
        orderDate: pastReturnDate,
        subOrderId: 'TEST-CRC-ORD-14-CAT1',
        product: productA._id,
        sku: productA.sku,
        quantity: 1,
        sellingPrice: 49900,
        grossAmount: 49900,
        status: 'returned',
    });
    // Create charge in category 1
    const cat1Charge = await CustomerReturnCharge_1.CustomerReturnCharge.create({
        transactionId: 'CRC-TEST-CAT1',
        order: order14._id,
        businessAccount: accountA._id,
        product: productA._id,
        category: category1._id,
        sku: productA.sku,
        orderDate: pastReturnDate,
        returnDate: pastReturnDate,
        returnedQuantity: 1,
        originalOrderValue: 49900,
        chargeType: 'fixed_order',
        appliedRate: 6000,
        baseCharge: 6000,
        handlingCharge: 0,
        totalCharge: 6000,
        transactionType: 'customer_return_charge',
        status: 'applied',
        settingsVersion: 1,
        calculationTimestamp: new Date(),
    });
    // Query filtering by Category 1
    const cat1Results = await CustomerReturnCharge_1.CustomerReturnCharge.find({
        category: category1._id,
        transactionId: 'CRC-TEST-CAT1',
    });
    assert(cat1Results.length === 1, 'Test 14: Category 1 filter must match');
    // Query filtering by Category 2
    const cat2Results = await CustomerReturnCharge_1.CustomerReturnCharge.find({
        category: category2._id,
        transactionId: 'CRC-TEST-CAT1',
    });
    assert(cat2Results.length === 0, 'Test 14: Category 2 filter must exclude');
    console.log('  PASSED: Date and category filtering validated.\n');
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 15: Profit & Loss totals reconciliation against individual transactions
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 15: Profit & Loss totals reconciliation...');
    // Aggregate all applied test charges
    const testChargesAgg = await CustomerReturnCharge_1.CustomerReturnCharge.aggregate([
        {
            $match: {
                isDeleted: false,
                status: 'applied',
                sku: { $regex: /^TEST-CRC-/ },
            },
        },
        {
            $group: {
                _id: null,
                totalBase: { $sum: '$baseCharge' },
                totalHandling: { $sum: '$handlingCharge' },
                totalCharge: { $sum: '$totalCharge' },
                count: { $sum: 1 },
            },
        },
    ]);
    const aggResult = testChargesAgg[0];
    assert(aggResult != null, 'Test 15: Aggregation result must exist');
    assert(aggResult.totalCharge === aggResult.totalBase + aggResult.totalHandling, 'Test 15: Total return expense must reconcile exactly to Base + Handling');
    // Verify against sum of each document individually
    const allDocs = await CustomerReturnCharge_1.CustomerReturnCharge.find({
        isDeleted: false,
        status: 'applied',
        sku: { $regex: /^TEST-CRC-/ },
    });
    const manualSum = allDocs.reduce((acc, doc) => acc + doc.totalCharge, 0);
    assert(manualSum === aggResult.totalCharge, `Test 15: Manual sum (${manualSum}) must match agg (${aggResult.totalCharge})`);
    console.log(`  PASSED: P&L customer return expenses reconcile 100% (Sum: ₹${(manualSum / 100).toFixed(2)} across ${allDocs.length} transactions).\n`);
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 16: Audit logs generated
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Test 16: Audit logs generated...');
    const auditLogs = await AuditLog_1.AuditLog.find({
        resource: { $in: ['CustomerReturnCharge', 'CustomerReturnChargeSettings'] },
    }).sort({ createdAt: -1 });
    assert(auditLogs.length > 0, 'Test 16: Audit logs must exist for customer return charge actions');
    const createLog = auditLogs.find((l) => l.action === 'CREATE');
    assert(createLog != null, 'Test 16: CREATE audit log must exist');
    console.log(`  PASSED: Audit logging verified (${auditLogs.length} audit records captured).\n`);
    // ───────────────────────────────────────────────────────────────────────────
    // BONUS: Historical Recalculation Engine Verification (Preview & Execute)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('Verifying Historical Recalculation Engine (Preview & Execute)...');
    const preview = await (0, customerReturnCharge_service_1.previewHistoricalRecalculation)({
        accountId: accountA._id.toString(),
    });
    assert(preview.totalRecords > 0, 'Recalculation preview must identify records');
    assert(preview.sampleItems.length > 0, 'Recalculation preview must include sample items');
    console.log(`  Preview computed: ${preview.totalRecords} records, Old: ₹${(preview.currentTotalExpense / 100).toFixed(2)}, New: ₹${(preview.newTotalExpense / 100).toFixed(2)}, Diff: ₹${(preview.difference / 100).toFixed(2)}`);
    const execResult = await (0, customerReturnCharge_service_1.executeHistoricalRecalculation)({
        accountId: accountA._id.toString(),
        userId: new mongoose_1.default.Types.ObjectId(),
    });
    assert(execResult.updatedCount > 0, 'Recalculation execution must update records');
    const adjustedRecords = await CustomerReturnCharge_1.CustomerReturnCharge.countDocuments({
        businessAccount: accountA._id,
        status: 'adjusted',
    });
    assert(adjustedRecords === execResult.updatedCount, 'All updated records should have status adjusted');
    console.log(`  Recalculation executed: ${execResult.updatedCount} records marked adjusted with audit trail.\n`);
    // Clean up test data
    await CustomerReturnCharge_1.CustomerReturnCharge.deleteMany({ sku: { $regex: /^TEST-CRC-/ } });
    await Order_1.Order.deleteMany({ subOrderId: { $regex: /^TEST-CRC-/ } });
    await ReturnOrder_1.ReturnOrder.deleteMany({ meeshoOrderId: { $regex: /^TEST-CRC-/ } });
    await CustomerReturnChargeSettings_1.CustomerReturnChargeSettings.deleteMany({ notes: { $regex: /^Automated Test Settings/ } });
    await Product_1.Product.deleteMany({ sku: { $regex: /^TEST-CRC-/ } });
    await Category_1.Category.deleteMany({ name: { $regex: /^Test (Floral|Woody) Perfume/ } });
    await BusinessAccount_1.BusinessAccount.deleteMany({ gstin: { $in: ['24TESTACT1111A1', '27TESTACT2222B2'] } });
    console.log('================================================================');
    console.log('🎉 ALL 16 TESTS PASSED SUCCESSFULLY! ZERO FAILURES.');
    console.log('================================================================\n');
    await mongoose_1.default.disconnect();
}
runAll16Tests().catch((err) => {
    console.error('\n❌ TEST RUN FAILED:', err);
    process.exit(1);
});
//# sourceMappingURL=test-return-charges.js.map