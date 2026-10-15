"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./config/db");
const errorHandler_1 = require("./middleware/errorHandler");
const rateLimiter_1 = require("./middleware/rateLimiter");
// Routes
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const account_routes_1 = __importDefault(require("./routes/account.routes"));
const partner_routes_1 = __importDefault(require("./routes/partner.routes"));
const category_routes_1 = __importDefault(require("./routes/category.routes"));
const product_routes_1 = __importDefault(require("./routes/product.routes"));
const vendor_routes_1 = __importDefault(require("./routes/vendor.routes"));
const order_routes_1 = __importDefault(require("./routes/order.routes"));
const return_routes_1 = __importDefault(require("./routes/return.routes"));
const stockPurchase_routes_1 = __importDefault(require("./routes/stockPurchase.routes"));
const inventory_routes_1 = __importDefault(require("./routes/inventory.routes"));
const expense_routes_1 = __importDefault(require("./routes/expense.routes"));
const report_routes_1 = __importDefault(require("./routes/report.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const audit_routes_1 = __importDefault(require("./routes/audit.routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Connect DB
(0, db_1.connectDB)();
// Middleware
app.use((0, cors_1.default)({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use(rateLimiter_1.rateLimiter);
// API Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/users', user_routes_1.default);
app.use('/api/business-accounts', account_routes_1.default);
app.use('/api/partners', partner_routes_1.default);
app.use('/api/categories', category_routes_1.default);
app.use('/api/products', product_routes_1.default);
app.use('/api/vendors', vendor_routes_1.default);
app.use('/api/orders', order_routes_1.default);
app.use('/api/returns', return_routes_1.default);
app.use('/api/stock-purchases', stockPurchase_routes_1.default);
app.use('/api/inventory', inventory_routes_1.default);
app.use('/api/expenses', expense_routes_1.default);
app.use('/api/reports', report_routes_1.default);
app.use('/api/analytics', analytics_routes_1.default);
app.use('/api/audit-logs', audit_routes_1.default);
// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Error handler (must be last)
app.use(errorHandler_1.errorHandler);
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map