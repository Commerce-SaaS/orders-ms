export const ORDER_PATTERNS = {
    CREATE: "order.create",
    FIND_ALL: "order.find_all",
    FIND_ONE: "order.find_one",
    UPDATE: "order.update",
    CANCEL: "order.cancel",

    // Event patterns for payment events
    PAYMENT_STATUS: "payment.status",
} as const;