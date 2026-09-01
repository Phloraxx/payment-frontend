export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "expired",
  "cancelled",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface PublicPayment {
  id: string;
  name: string;
  externalId?: string;
  metadata: Record<string, unknown>;
  status: PaymentStatus;
  requestedAmount: string;
  requestedAmountPaise: number;
  payableAmount: string;
  payableAmountPaise: number;
  adjustment: string;
  adjustmentPaise: number;
  upiUri: string;
  createdAt: string;
  expiresAt: string;
  graceUntil: string;
  paidAt: string | null;
  payerName?: string;
  payerUpiId?: string;
}

export interface CreatePaymentRequest {
  amount: number;
  name: string;
  externalId: string;
  metadata?: Record<string, unknown>;
  requestId: string;
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string };
  code?: string;
  message?: string;
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (
    typeof value === "string" &&
    (PAYMENT_STATUSES as readonly string[]).includes(value)
  );
}

function parseFormattedPaise(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d+)\.(\d{2})$/.exec(value);
  if (!match) return undefined;
  const rupees = Number(match[1]);
  const paise = Number(match[2]);
  if (!Number.isSafeInteger(rupees) || !Number.isSafeInteger(paise))
    return undefined;
  const total = rupees * 100 + paise;
  return Number.isSafeInteger(total) ? total : undefined;
}

function validTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parsePublicPayment(value: unknown): PublicPayment | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const item = value as Record<string, unknown>;
  const requested = parseFormattedPaise(item.requested_amount);
  const payable = parseFormattedPaise(item.payable_amount);
  const adjustment = parseFormattedPaise(item.adjustment);
  if (
    typeof item.id !== "string" ||
    !/^[a-z0-9_-]{8,64}$/i.test(item.id) ||
    item.object !== "payment" ||
    typeof item.name !== "string" ||
    item.name.trim() === "" ||
    item.name.length > 120 ||
    !(
      item.external_id === undefined ||
      (typeof item.external_id === "string" && item.external_id.length <= 255)
    ) ||
    !item.metadata ||
    typeof item.metadata !== "object" ||
    Array.isArray(item.metadata) ||
    !isPaymentStatus(item.status) ||
    item.currency !== "INR" ||
    requested === undefined ||
    requested <= 0 ||
    payable === undefined ||
    payable <= requested ||
    adjustment === undefined ||
    payable - requested !== adjustment ||
    typeof item.upi_uri !== "string" ||
    item.upi_uri.length > 4096 ||
    !item.upi_uri.startsWith("upi://pay?") ||
    !validTime(item.created_at) ||
    !validTime(item.expires_at) ||
    !validTime(item.grace_until) ||
    !(item.paid_at === null || validTime(item.paid_at))
  )
    return undefined;

  let payerName: string | undefined;
  let payerUpiId: string | undefined;
  if (item.payer !== undefined) {
    if (
      !item.payer ||
      typeof item.payer !== "object" ||
      Array.isArray(item.payer)
    )
      return undefined;
    const payer = item.payer as Record<string, unknown>;
    if (!(
      payer.name === null ||
      payer.name === undefined ||
      typeof payer.name === "string"
    ))
      return undefined;
    if (!(
      payer.upi_id === null ||
      payer.upi_id === undefined ||
      typeof payer.upi_id === "string"
    ))
      return undefined;
    payerName =
      typeof payer.name === "string" && payer.name.trim()
        ? payer.name
        : undefined;
    payerUpiId =
      typeof payer.upi_id === "string" && payer.upi_id.trim()
        ? payer.upi_id
        : undefined;
  }

  return {
    id: item.id,
    name: item.name,
    externalId:
      typeof item.external_id === "string" ? item.external_id : undefined,
    metadata: item.metadata as Record<string, unknown>,
    status: item.status,
    requestedAmount: item.requested_amount as string,
    requestedAmountPaise: requested,
    payableAmount: item.payable_amount as string,
    payableAmountPaise: payable,
    adjustment: item.adjustment as string,
    adjustmentPaise: adjustment,
    upiUri: item.upi_uri,
    createdAt: item.created_at as string,
    expiresAt: item.expires_at as string,
    graceUntil: item.grace_until as string,
    paidAt: item.paid_at as string | null,
    payerName,
    payerUpiId,
  };
}

export function isPublicPayment(value: unknown): value is PublicPayment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    isPaymentStatus(item.status) &&
    typeof item.requestedAmountPaise === "number" &&
    typeof item.payableAmountPaise === "number" &&
    typeof item.upiUri === "string" &&
    validTime(item.expiresAt) &&
    validTime(item.graceUntil)
  );
}

export function isTerminalStatus(status: PaymentStatus): boolean {
  return status !== "pending";
}
