import type {
  RazorpayLiveMethods,
  RazorpayLiveOrder,
} from "../../shared/razorpay-live.js";
import type {
  RazorpayTestMethods,
  RazorpayTestOrder,
  VerifyRazorpayTestRequest,
} from "../../shared/razorpay.js";

export const RAZORPAY_CUSTOM_SCRIPT_URL =
  "https://checkout.razorpay.com/v1/razorpay.js";

export interface RazorpayCustomErrorResponse {
  error?: {
    code?: string;
    description?: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: { payment_id?: string; order_id?: string };
  };
}

export interface RazorpayNetbankingTestData {
  amount: number;
  currency: "INR";
  order_id: string;
  method: "netbanking";
  bank: string;
  email: "test@example.com";
  contact: "9123456780";
  description: string;
}

export interface RazorpayReadyResponse {
  methods?: unknown;
}

export interface RazorpayCustomInstance {
  once(
    event: "ready",
    callback: (response: RazorpayReadyResponse) => void,
  ): void;
  on(
    event: "payment.success",
    callback: (response: VerifyRazorpayTestRequest) => void,
  ): void;
  on(
    event: "payment.error",
    callback: (response: RazorpayCustomErrorResponse) => void,
  ): void;
  createPayment(data: RazorpayNetbankingTestData): void;
}

export interface RazorpayCustomConstructor {
  new (options: { key: string }): RazorpayCustomInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayCustomConstructor;
  }
}

let scriptPromise: Promise<void> | undefined;

export function razorpayPaymentErrorMessage(
  response: RazorpayCustomErrorResponse,
): string {
  const message = response.error?.description
    ?.replace(/[\r\n\t]+/g, " ")
    .trim();
  return message
    ? message.slice(0, 240)
    : "Razorpay reported a failed or cancelled test payment.";
}

type RazorpayMethodsPayload = {
  netbanking?: unknown;
  upi_intent?: unknown;
  upi_config?: unknown;
};

function normalizeReadyMethods(
  value: unknown,
  mode: "test" | "live",
): RazorpayTestMethods | RazorpayLiveMethods {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Razorpay returned invalid payment methods.");
  }
  const payload = value as RazorpayMethodsPayload;
  if (
    !payload.netbanking ||
    typeof payload.netbanking !== "object" ||
    Array.isArray(payload.netbanking)
  ) {
    throw new Error("Razorpay returned invalid netbanking methods.");
  }
  const netbanking = Object.entries(
    payload.netbanking as Record<string, unknown>,
  )
    .filter(
      ([code, name]) =>
        /^[A-Z0-9_]{2,16}$/.test(code) &&
        typeof name === "string" &&
        name.trim().length >= 2,
    )
    .map(([code, name]) => ({
      code,
      name: (name as string).trim().slice(0, 120),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "en-IN"))
    .slice(0, 100);
  return {
    mode,
    netbanking,
    upiIntentAvailable: payload.upi_intent === true,
    upiQrAvailable:
      Array.isArray(payload.upi_config) && payload.upi_config.length > 0,
  } as RazorpayTestMethods | RazorpayLiveMethods;
}

export function buildNetbankingTestPayment(
  order: RazorpayTestOrder | RazorpayLiveOrder,
  bankCode: string,
  mode: "test" | "live" = "test",
): RazorpayNetbankingTestData {
  if (!order.razorpayOrderId) throw new Error("Razorpay order is not ready.");
  if (!/^[A-Z0-9_]{2,16}$/.test(bankCode))
    throw new Error("Select a valid enabled bank.");
  return {
    amount: order.amountPaise,
    currency: "INR",
    order_id: order.razorpayOrderId,
    method: "netbanking",
    bank: bankCode,
    email: "test@example.com",
    contact: "9123456780",
    description:
      mode === "live"
        ? "IEEE Sahrdaya Razorpay Live ₹1 pilot"
        : "IEEE Sahrdaya Razorpay Test payment",
  };
}

export function loadRazorpayCustomSdk(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-razorpay-custom]",
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Razorpay Custom Checkout failed to load.")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_CUSTOM_SCRIPT_URL;
    script.async = true;
    script.dataset.razorpayCustom = "true";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Razorpay Custom Checkout failed to load."));
    document.head.append(script);
  });
  return scriptPromise;
}

async function discoverRazorpayMethods(
  keyId: string,
  mode: "test" | "live",
): Promise<RazorpayTestMethods | RazorpayLiveMethods> {
  await loadRazorpayCustomSdk();
  const Razorpay = window.Razorpay;
  if (!Razorpay)
    throw new Error("Razorpay Custom Checkout failed to initialize.");
  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId))
    throw new Error("Invalid Razorpay Key ID.");
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) reject(new Error("Razorpay payment methods timed out."));
    }, 8_000);
    const razorpay = new Razorpay({ key: keyId });
    razorpay.once("ready", (response) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        resolve(normalizeReadyMethods(response.methods, mode));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export async function discoverRazorpayTestMethods(
  keyId: string,
): Promise<RazorpayTestMethods> {
  return discoverRazorpayMethods(keyId, "test") as Promise<RazorpayTestMethods>;
}

export async function discoverRazorpayLiveMethods(
  keyId: string,
): Promise<RazorpayLiveMethods> {
  return discoverRazorpayMethods(keyId, "live") as Promise<RazorpayLiveMethods>;
}
