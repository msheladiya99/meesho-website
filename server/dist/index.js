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
const packing_routes_1 = __importDefault(require("./routes/packing.routes"));
const return_routes_1 = __importDefault(require("./routes/return.routes"));
const stockPurchase_routes_1 = __importDefault(require("./routes/stockPurchase.routes"));
const inventory_routes_1 = __importDefault(require("./routes/inventory.routes"));
const expense_routes_1 = __importDefault(require("./routes/expense.routes"));
const report_routes_1 = __importDefault(require("./routes/report.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const audit_routes_1 = __importDefault(require("./routes/audit.routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 5000;
const HOST = '0.0.0.0';
// Enable trust proxy for Render reverse-proxy (fixes rate-limiting and IP tracking)
app.set('trust proxy', 1);
// Connect DB asynchronously on boot
(0, db_1.connectDB)().catch((err) => {
    console.error('Initial DB connection attempt encountered error:', err.message);
});
// Configure CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow non-browser requests (e.g. mobile apps, curl, server-to-server, health checks)
        if (!origin)
            return callback(null, true);
        // If explicit origins are configured, check match
        if (allowedOrigins.length > 0) {
            if (allowedOrigins.includes(origin) ||
                allowedOrigins.includes('*') ||
                /\.vercel\.app$/.test(origin) ||
                /\.onrender\.com$/.test(origin)) {
                return callback(null, true);
            }
            return callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
        // Default development fallback
        return callback(null, true);
    },
    credentials: true,
}));
// ─────────────────────────────────────────────────────────────────────────────
// Production Health & Readiness Endpoints (Mounted BEFORE Rate Limiter)
// ─────────────────────────────────────────────────────────────────────────────
// Liveness probe for Render health-check path (configured in Render Dashboard: /health)
app.get(['/health', '/api/health'], (_req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'perfume-business-manager',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});
// Readiness probe (verifies MongoDB connection readiness without heavy queries)
app.get(['/ready', '/api/ready', '/health/ready'], (_req, res) => {
    const connected = (0, db_1.isDbConnected)();
    if (connected) {
        res.status(200).json({
            status: 'ready',
            service: 'perfume-business-manager',
            database: 'connected',
            timestamp: new Date().toISOString(),
        });
    }
    else {
        res.status(503).json({
            status: 'not_ready',
            service: 'perfume-business-manager',
            database: 'disconnected',
            message: 'Database connection is initializing or temporarily unavailable',
            timestamp: new Date().toISOString(),
        });
    }
});
// Parsers
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Apply rate limiter to business API routes
app.use(rateLimiter_1.rateLimiter);
// Business API Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/users', user_routes_1.default);
app.use('/api/business-accounts', account_routes_1.default);
app.use('/api/partners', partner_routes_1.default);
app.use('/api/categories', category_routes_1.default);
app.use('/api/products', product_routes_1.default);
app.use('/api/vendors', vendor_routes_1.default);
app.use('/api/orders', order_routes_1.default);
app.use('/api/packing', packing_routes_1.default);
app.use('/api/returns', return_routes_1.default);
app.use('/api/stock-purchases', stockPurchase_routes_1.default);
app.use('/api/inventory', inventory_routes_1.default);
app.use('/api/expenses', expense_routes_1.default);
app.use('/api/reports', report_routes_1.default);
app.use('/api/analytics', analytics_routes_1.default);
app.use('/api/audit-logs', audit_routes_1.default);
// Error handler (must be last)
app.use(errorHandler_1.errorHandler);
// ─────────────────────────────────────────────────────────────────────────────
// Server Listen & Graceful Shutdown
// ─────────────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 Server listening on http://${HOST}:${PORT} [NODE_ENV=${process.env.NODE_ENV || 'production'}]`);
});
let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
    if (isShuttingDown)
        return;
    isShuttingDown = true;
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    // Stop accepting new connections
    server.close(async () => {
        console.log('🔒 HTTP server closed');
        try {
            await (0, db_1.closeDB)();
            console.log('✅ Graceful shutdown completed cleanly');
            process.exit(0);
        }
        catch (err) {
            console.error('❌ Error during database shutdown:', err);
            process.exit(1);
        }
    });
    // Force exit after 10s if active connections hang
    setTimeout(() => {
        console.error('⚠️ Forcefully terminating after shutdown timeout (10s)');
        process.exit(1);
    }, 10000).unref();
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
    console.error('🚨 Unhandled Promise Rejection:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err.message, err.stack);
    gracefulShutdown('uncaughtException');
});
exports.default = app;
//# sourceMappingURL=index.js.map