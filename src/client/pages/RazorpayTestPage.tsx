import {
  ArrowLeft,
  CheckCircle,
  CircleNotch,
  Bank,
  ShieldCheck,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";

import type {
  RazorpayTestMethods,
  RazorpayTestOrder,
  VerifyRazorpayTestRequest,
} from "../../shared/razorpay.js";
import { isRazorpayTestTerminal } from "../../shared/razorpay.js";
import { PageShell } from "../components/PageShell";
import {
  ClientApiError,
  getRazorpayTestOrder,
  verifyRazorpayTestOrder,
} from "../lib/api.js";
import {
  buildNetbankingTestPayment,
  discoverRazorpayTestMethods,
  razorpayPaymentErrorMessage,
  type RazorpayCustomErrorResponse,
} from "../lib/razorpay-custom.js";
import { formatRupeesFromPaise } from "../lib/money.js";

type SdkState = "loading" | "ready" | "error";

export function RazorpayTestPage() {
  const { id = "" } = useParams();
  const [order, setOrder] = useState<RazorpayTestOrder>();
  const [loading, setLoading] = useState(true);
  const [sdkState, setSdkState] = useState<SdkState>("loading");
  const [methods, setMethods] = useState<RazorpayTestMethods>();
  const [selectedBank, setSelectedBank] = useState("");
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return;
      try {
        const value = await getRazorpayTestOrder(id, signal);
        setOrder(value);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        )
          return;
        setError(
          requestError instanceof ClientApiError
            ? requestError.message
            : "Unable to load the Razorpay test order.",
        );
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (!order?.keyId) return;
    let active = true;
    void discoverRazorpayTestMethods(order.keyId)
      .then((enabledMethods) => {
        if (!active) return;
        setMethods(enabledMethods);
        setSelectedBank(enabledMethods.netbanking[0]?.code ?? "");
        setSdkState("ready");
      })
      .catch((requestError) => {
        if (!active) return;
        setSdkState("error");
        setError(
          requestError instanceof ClientApiError
            ? requestError.message
            : "Razorpay secure processing could not be loaded. Please refresh and try again.",
        );
      });
    return () => {
      active = false;
    };
  }, [order?.keyId]);

  useEffect(() => {
    if (!order || isRazorpayTestTerminal(order.status)) return;
    const timer = window.setInterval(() => void refresh(), 2_500);
    return () => window.clearInterval(timer);
  }, [order, refresh]);

  const verify = useCallback(
    async (response: VerifyRazorpayTestRequest) => {
      if (!order) return;
      setMessage(
        "Payment response received. Verifying securely with Razorpay…",
      );
      setError(undefined);
      try {
        const updated = await verifyRazorpayTestOrder(order.id, response);
        setOrder(updated);
        setMessage(
          updated.status === "captured"
            ? "Test payment captured successfully."
            : "Signature verified. Waiting for provider capture confirmation.",
        );
      } catch (requestError) {
        setError(
          requestError instanceof ClientApiError
            ? requestError.message
            : "Could not verify the Razorpay test payment.",
        );
      } finally {
        setProcessing(false);
      }
    },
    [order],
  );

  const handlePaymentError = useCallback(
    (response: RazorpayCustomErrorResponse) => {
      setProcessing(false);
      setMessage(undefined);
      setError(razorpayPaymentErrorMessage(response));
    },
    [],
  );

  const startPayment = () => {
    if (
      !order ||
      order.status !== "created" ||
      sdkState !== "ready" ||
      !window.Razorpay ||
      !selectedBank
    )
      return;
    const bank = methods?.netbanking.find((item) => item.code === selectedBank);
    if (!bank) {
      setError("Select an enabled bank before continuing.");
      return;
    }
    setProcessing(true);
    setMessage(`Opening ${bank.name} secure Test Mode authentication…`);
    setError(undefined);
    try {
      const razorpay = new window.Razorpay({ key: order.keyId });
      razorpay.on("payment.success", (response) => void verify(response));
      razorpay.on("payment.error", handlePaymentError);
      razorpay.createPayment(buildNetbankingTestPayment(order, bank.code));
    } catch (paymentError) {
      setProcessing(false);
      setMessage(undefined);
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to start Razorpay Custom Checkout.",
      );
    }
  };

  if (loading) {
    return (
      <CenteredState
        icon={<CircleNotch className="h-10 w-10 animate-spin" />}
        title="Loading test order"
        description="Checking the isolated Razorpay Test service."
      />
    );
  }
  if (!order) {
    return (
      <CenteredState
        icon={<WarningCircle className="h-10 w-10" />}
        title="Test order unavailable"
        description={error || "The Razorpay test order could not be found."}
      />
    );
  }

  const captured = order.status === "captured";
  const failed = order.status === "failed" || order.status === "create_failed";
  const waiting = !captured && !failed && order.status !== "created";

  return (
    <PageShell brandVariant="razorpay-test">
      <div className="relative z-10">
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-800">
          <strong>Razorpay Test Mode:</strong> this is a simulated bank payment.
          No real money is charged or settled.
        </div>

        <div className="mt-7 text-center">
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${captured ? "bg-emerald-50 text-emerald-700" : failed ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"}`}
          >
            {captured ? (
              <CheckCircle weight="fill" className="h-9 w-9" />
            ) : failed ? (
              <XCircle weight="fill" className="h-9 w-9" />
            ) : waiting ? (
              <CircleNotch className="h-9 w-9 animate-spin" />
            ) : (
              <Bank className="h-9 w-9" />
            )}
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            IEEE Razorpay Test Checkout
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-slate-950">
            {formatRupeesFromPaise(order.amountPaise)}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Status:{" "}
            <span className="font-semibold text-slate-800">
              {order.status.replaceAll("_", " ")}
            </span>
          </p>
        </div>

        {order.status === "created" && (
          <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-950">
                  Choose your test bank
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  Choose an enabled bank inside the IEEE portal. Only the bank
                  authentication step opens securely through Razorpay.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <label
                htmlFor="razorpay-test-bank"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Bank
              </label>
              <select
                id="razorpay-test-bank"
                value={selectedBank}
                onChange={(event) => {
                  setSelectedBank(event.target.value);
                  setError(undefined);
                }}
                disabled={sdkState !== "ready" || processing}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {methods?.netbanking.length ? (
                  methods.netbanking.map((bank) => (
                    <option key={bank.code} value={bank.code}>
                      {bank.name}
                    </option>
                  ))
                ) : (
                  <option value="">No enabled banks available</option>
                )}
              </select>
            </div>

            <button
              type="button"
              onClick={startPayment}
              disabled={sdkState !== "ready" || processing || !selectedBank}
              className="button-primary mt-4 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {processing ? (
                <CircleNotch className="h-5 w-5 animate-spin" />
              ) : (
                <ShieldCheck className="h-5 w-5" />
              )}
              {processing ? "Opening secure bank page…" : "Continue securely"}
            </button>

            <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
              Razorpay’s payment-method popup is removed. Its secure demo bank
              page will let you choose Success or Failure.
            </p>
            {sdkState === "loading" && (
              <p className="mt-3 text-center text-xs font-medium text-slate-500">
                Loading enabled banks and secure payment SDK…
              </p>
            )}
          </section>
        )}

        {captured && (
          <div
            role="status"
            className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center text-sm leading-relaxed text-emerald-800"
          >
            <strong>Test payment captured.</strong> Razorpay and the server both
            confirmed the simulated payment.
          </div>
        )}
        {failed && (
          <div
            role="alert"
            className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-center text-sm leading-relaxed text-red-700"
          >
            <strong>Test payment failed.</strong>{" "}
            {order.error || "Create another test order to retry."}
          </div>
        )}
        {message && !captured && (
          <div
            role="status"
            className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-center text-sm text-slate-700"
          >
            {message}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-center text-sm text-red-700"
          >
            {error}
          </div>
        )}
        {waiting && (
          <button
            onClick={() => void refresh()}
            className="button-secondary mt-7"
          >
            <CircleNotch className="h-5 w-5" />
            Check provider status
          </button>
        )}

        <dl className="mt-7 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">Local order</dt>
            <dd className="break-all font-mono text-xs text-slate-700">
              {order.id}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">Razorpay order</dt>
            <dd className="break-all font-mono text-xs text-slate-700">
              {order.razorpayOrderId || "Creating…"}
            </dd>
          </div>
          {order.razorpayPaymentId && (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Payment</dt>
              <dd className="break-all font-mono text-xs text-slate-700">
                {order.razorpayPaymentId}
              </dd>
            </div>
          )}
        </dl>

        <Link
          to="/"
          className="mt-7 flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Start another payment
        </Link>
      </div>
    </PageShell>
  );
}

function CenteredState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <PageShell brandVariant="razorpay-test">
      <div className="relative z-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          {icon}
        </div>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {description}
        </p>
        <Link to="/" className="button-secondary mt-7">
          <ArrowLeft className="h-4 w-4" />
          Back to payments
        </Link>
      </div>
    </PageShell>
  );
}
