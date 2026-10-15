"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = exports.errorHandler = void 0;
const errorHandler = (err, _req, res, _next) => {
    console.error('Error:', err.message);
    // Mongoose duplicate key
    if (err.code === 11000) {
        res.status(400).json({ success: false, message: 'Duplicate entry detected' });
        return;
    }
    // Mongoose validation error
    if (err.name === 'ValidationError') {
        res.status(400).json({ success: false, message: err.message });
        return;
    }
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};
exports.errorHandler = errorHandler;
class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
//# sourceMappingURL=errorHandler.js.map