import { useCallback, useEffect, useState } from 'react';

import type { PublicPayment } from '../../shared/payment.js';
import { isTerminalStatus } from '../../shared/payment.js';
import { ClientApiError, getPayment } from '../lib/api.js';
import { clearPaymentSession, loadPaymentSession, savePaymentSession } from '../lib/session.js';

const POLL_INTERVAL_MS = 2_000;

interface PaymentStatusState {
  payment?: PublicPayment;
  loading: boolean;
  refreshing: boolean;
  error?: string;
}

export function usePaymentStatus(id: string): PaymentStatusState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<PaymentStatusState>(() => ({
    payment: loadPaymentSession(id),
    loading: true,
    refreshing: false,
  }));
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    let retryable = true;

    const schedule = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    const fetchLatest = async (): Promise<PublicPayment | undefined> => {
      controller?.abort();
      const currentController = new AbortController();
      controller = currentController;
      setState((current) => ({ ...current, refreshing: Boolean(current.payment), error: undefined }));
      try {
        const fresh = await getPayment(id, currentController.signal);
        if (disposed || currentController.signal.aborted) return undefined;

        const stored = loadPaymentSession(id);
        const payment: PublicPayment = {
          ...fresh,
          paymentAccountLabel: fresh.paymentAccountLabel ?? stored?.paymentAccountLabel,
          verificationMethod: fresh.verificationMethod ?? stored?.verificationMethod,
          paymentFlow: fresh.paymentFlow ?? stored?.paymentFlow,
          upiUri: fresh.upiUri ?? (fresh.status === 'pending' ? stored?.upiUri : undefined),
          qrPayload: fresh.qrPayload ?? (fresh.status === 'pending' ? stored?.qrPayload : undefined),
        };
        if (payment.status === 'pending' && (payment.upiUri || payment.qrPayload)) savePaymentSession(payment);
        if (isTerminalStatus(payment.status)) clearPaymentSession(id);
        setState({ payment, loading: false, refreshing: false });
        return payment;
      } catch (error) {
        if (disposed || currentController.signal.aborted) return undefined;
        const message = error instanceof ClientApiError ? error.message : 'Unable to check payment status.';
        retryable = !(error instanceof ClientApiError && (error.status === 400 || error.status === 404));
        if (!retryable) {
          clearPaymentSession(id);
          setState({ loading: false, refreshing: false, error: message });
        } else {
          setState((current) => ({ ...current, loading: false, refreshing: false, error: message }));
        }
        return undefined;
      }
    };

    const poll = async () => {
      const payment = await fetchLatest();
      if (disposed) return;
      if (retryable && (!payment || !isTerminalStatus(payment.status))) schedule();
    };

    const onVisibility = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'visible') void poll();
    };

    void poll();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [id, refreshNonce]);

  const refresh = useCallback(async () => {
    setRefreshNonce((current) => current + 1);
  }, []);

  return { ...state, refresh };
}
