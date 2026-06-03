// prototype only, not final API contract

export const paymentReports = [
  {
    orderId: "order-001",
    originalAmount: 150,
    authorizedAmount: 150,
    finalAmount: null,
    captureAmount: null,
    releasedAmount: null,
    recipientName: "青山手作茶 中山店",
    qrCodeLabel: "Line Pay QR code",
    status: "authorized",
    paymentStatus: "authorized",
    authorizationStatus: "authorized",
    discountStatus: "not_yet_qualified",
    note: "Line Pay authorization prototype."
  },
  {
    orderId: "order-002",
    originalAmount: 85,
    authorizedAmount: 85,
    finalAmount: 63,
    captureAmount: 63,
    releasedAmount: 22,
    recipientName: "晨露鮮奶茶 松江店",
    qrCodeLabel: "Line Pay QR code",
    status: "captured",
    paymentStatus: "captured",
    authorizationStatus: "captured",
    discountStatus: "qualified",
    note: "Line Pay partial capture prototype."
  }
];
