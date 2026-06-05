// prototype only, not final API contract

export const customerOrderDemo = {
  activeOrderId: null,
  discountAmount: 0,
  minimumPayableAmount: 0,
  orderItems: [],
  pickupPass: {
    label: "取貨憑證（店家確認接單後顯示）",
    code: "",
    qrLabel: "QR"
  },
  historyOrders: []
};
