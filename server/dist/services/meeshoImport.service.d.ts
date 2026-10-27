import { OrderStatus } from '../models/Order';
import { ReturnType, ReturnStatus, ItemCondition } from '../models/ReturnOrder';
export interface ParsedMeeshoRow {
    rowNumber: number;
    subOrderId: string;
    meeshoOrderId?: string;
    orderDate: Date;
    sku: string;
    productName?: string;
    quantity: number;
    sellingPrice: number;
    status: OrderStatus;
    carrierName?: string;
    shippingLabelId?: string;
    isReturn: boolean;
    returnType?: ReturnType;
    returnStatus?: ReturnStatus;
    returnDate?: Date;
    returnReason?: string;
    itemCondition?: ItemCondition;
    rawStatus?: string;
}
export interface ImportSummary {
    totalRows: number;
    ordersCreated: number;
    ordersUpdated: number;
    ordersSkipped: number;
    returnsCreated: number;
    productsAutoCreated: number;
    errors: Array<{
        rowNumber: number;
        subOrderId?: string;
        error: string;
    }>;
}
export declare const parseFlexibleDate: (raw: any) => Date;
export declare const parsePriceToPaise: (raw: any) => number;
export declare const mapMeeshoStatus: (rawStatusStr?: string, rawReturnTypeStr?: string, rawReturnStatusStr?: string) => {
    orderStatus: OrderStatus;
    isReturn: boolean;
    returnType?: ReturnType;
    returnStatus?: ReturnStatus;
    itemCondition?: ItemCondition;
};
export declare const parseMeeshoRawRows: (rawRows: Record<string, any>[], options?: {
    skipHoldAndReadyToShip?: boolean;
}) => ParsedMeeshoRow[];
export declare const parseMeeshoWorkbook: (buffer: Buffer, options?: {
    skipHoldAndReadyToShip?: boolean;
}) => ParsedMeeshoRow[];
export declare const importMeeshoOrdersAndReturns: (params: {
    businessAccount: string;
    rows: ParsedMeeshoRow[];
    userId?: string;
    skipHoldAndReadyToShip?: boolean;
}) => Promise<ImportSummary>;
export declare const generateMeeshoSampleTemplate: () => Buffer;
//# sourceMappingURL=meeshoImport.service.d.ts.map