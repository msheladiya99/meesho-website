import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB, closeDB, isDbConnected } from './config/db';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import accountRoutes from './routes/account.routes';
import partnerRoutes from './routes/partner.routes';
import categoryRoutes from './routes/category.routes';
import productRoutes from './routes/product.routes';
import vendorRoutes from './routes/vendor.routes';
import orderRoutes from './routes/order.routes';
import packingRoutes from './routes/packing.routes';
import returnRoutes from './routes/return.routes';
import stockPurchaseRoutes from './routes/stockPurchase.routes';
import inventoryRoutes from './routes/inventory.routes';
import expenseRoutes from './routes/expense.routes';
import reportRoutes from './routes/report.routes';
import analyticsRoutes from './routes/analytics.routes';
import auditRoutes from './routes/audit.routes';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const HOST = '0.0.0.0';

// Enable trust proxy for Render reverse-proxy (fixes rate-limiting and IP tracking)
app.set('trust proxy', 1);

// Connect DB asynchronously on boot
connectDB().catch((err) => {
  console.error('Initial DB connection attempt encountered error:', err.message);
});

// Configure CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. mobile apps, curl, server-to-server, health checks)
    if (!origin) return callback(null, true);

    // If explicit origins are configured, check match
    if (allowedOrigins.length > 0) {
      if (
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes('*') ||
        /\.vercel\.app$/.test(origin) ||
        /\.onrender\.com$/.test(origin)
      ) {
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

// Liveness probe for Render and external health checks (supports /, /health, /api/health)
app.get(['/', '/health', '/api/health'], (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'perfume-business-manager',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Readiness probe (verifies MongoDB connection readiness without heavy queries)
app.get(['/ready', '/api/ready', '/health/ready'], (_req, res) => {
  const connected = isDbConnected();
  if (connected) {
    res.status(200).json({
      status: 'ready',
      service: 'perfume-business-manager',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } else {
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply rate limiter to business API routes
app.use(rateLimiter);

// Business API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/business-accounts', accountRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/packing', packingRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/stock-purchases', stockPurchaseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/audit-logs', auditRoutes);

// Error handler (must be last)
app.use(errorHandler);

// ─────────────────────────────────────────────────────────────────────────────
// Server Listen & Graceful Shutdown
// ─────────────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Server listening on http://${HOST}:${PORT} [NODE_ENV=${process.env.NODE_ENV || 'production'}]`);
});

let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('🔒 HTTP server closed');
    try {
      await closeDB();
      console.log('✅ Graceful shutdown completed cleanly');
      process.exit(0);
    } catch (err) {
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

process.on('unhandledRejection', (reason: any) => {
  console.error('🚨 Unhandled Promise Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err: Error) => {
  console.error('💥 Uncaught Exception:', err.message, err.stack);
  gracefulShutdown('uncaughtException');
});

export default app;
