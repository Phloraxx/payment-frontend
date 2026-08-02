import type { RazorpayTestOrder, VerifyRazorpayTestRequest } from '../../shared/razorpay.js';

export const RAZORPAY_CUSTOM_SCRIPT_URL = 'https://checkout.razorpay.com/v1/razorpay.js';

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
  currency: 'INR';
  order_id: string;
  method: 'netbanking';
  bank: string;
  email: 'test@example.com';
  contact: '9123456780';
  description: string;
}

export interface RazorpayCustomInstance {
  on(event: 'payment.success', callback: (response: VerifyRazorpayTestRequest) => void): void;
  on(event: 'payment.error', callback: (response: RazorpayCustomErrorResponse) => void): void;
  createPayment(data: RazorpayNetbankingTestData): void;
}

export interface RazorpayCustomConstructor {
  new (options: { key: string; redirect: true; callback_url: string }): RazorpayCustomInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayCustomConstructor;
  }
}

let scriptPromise: Promise<void> | undefined;


export function razorpayPaymentErrorMessage(response: RazorpayCustomErrorResponse): string {
  const message = response.error?.description?.replace(/[\r\n\t]+/g, ' ').trim();
  return message ? message.slice(0, 240) : 'Razorpay reported a failed or cancelled test payment.';
}


export function buildRazorpayCallbackUrl(orderId: string, origin: string): string {
  if (!/^[a-z0-9_-]{8,64}$/i.test(orderId)) throw new Error('Invalid Razorpay order callback ID.');
  const url = new URL('/api/razorpay/test/callback', origin);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid Razorpay callback origin.');
  url.searchParams.set('order', orderId);
  return url.toString();
}

export function buildNetbankingTestPayment(
  order: RazorpayTestOrder,
  bankCode: string,
): RazorpayNetbankingTestData {
  if (!order.razorpayOrderId) throw new Error('Razorpay order is not ready.');
  if (!/^[A-Z0-9_]{2,16}$/.test(bankCode)) throw new Error('Select a valid enabled bank.');
  return {
    amount: order.amountPaise,
    currency: 'INR',
    order_id: order.razorpayOrderId,
    method: 'netbanking',
    bank: bankCode,
    email: 'test@example.com',
    contact: '9123456780',
    description: 'IEEE Sahrdaya Razorpay Test payment',
  };
}

export function loadRazorpayCustomSdk(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-custom]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Razorpay Custom Checkout failed to load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = RAZORPAY_CUSTOM_SCRIPT_URL;
    script.async = true;
    script.dataset.razorpayCustom = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Razorpay Custom Checkout failed to load.'));
    document.head.append(script);
  });
  return scriptPromise;
}
