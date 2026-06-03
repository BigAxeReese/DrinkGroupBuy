import { dealStatusLabels, paymentStatusLabels, pickupStatusLabels } from "../types/prototypeTypes";

export function StatusBadge({ status, type = "deal" }) {
  const labels = type === "payment" ? paymentStatusLabels : type === "pickup" ? pickupStatusLabels : dealStatusLabels;
  return <span className={`status-badge status-${status}`}>{labels[status] || status}</span>;
}
