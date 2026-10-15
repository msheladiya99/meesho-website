import { IOrder } from '../models/Order';
export interface ParsedCodeResult {
    rawCode: string;
    extractedIdentifier: string;
    format: 'json' | 'url' | 'key_value' | 'plain';
    potentialOrderIds: string[];
}
/**
 * Clean and parse scanned barcode or QR code strings from USB scanners,
 * camera streams, or mobile devices.
 */
export declare const parseScannedCode: (input: string) => ParsedCodeResult;
/**
 * Find order by scanned code with strict GSTIN account scoping.
 * Checks internal QR, shipping label ID, Meesho order ID, and internal Order ObjectId.
 * NEVER matches by product name or quantity alone.
 */
export declare const findOrderByScannedCode: (rawInput: string, businessAccountId?: string, userAllowedAccounts?: string[]) => Promise<{
    order: IOrder | null;
    matchedBy: string | null;
    exception?: string;
}>;
/**
 * Generate a unique internal QR code for an order.
 * Format: PKG-ORD-{shortId}-{timestamp}-{rand}
 */
export declare const generateInternalQrCode: (orderId: string, sku: string) => string;
/**
 * Log a scan exception for auditing and reports.
 */
export declare const recordScanException: (params: {
    businessAccount?: string;
    scannedCode: string;
    module: 'packing' | 'return';
    exceptionType: 'order_not_found' | 'already_packed' | 'already_returned' | 'qty_exceeded' | 'wrong_account' | 'invalid_format' | 'system_error';
    attemptedAction: string;
    operator?: string;
    details?: string;
}) => Promise<void>;
//# sourceMappingURL=qrScanner.service.d.ts.map