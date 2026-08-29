import type { PropsWithChildren } from 'react';

export type PageShellVariant = 'direct-upi' | 'razorpay-test' | 'razorpay-live';

const labels: Record<PageShellVariant, string> = {
  'direct-upi': 'Secure UPI',
  'razorpay-test': 'Sandbox',
  'razorpay-live': 'Live pilot',
};

export function PageShell({
  children,
  brandVariant = 'direct-upi',
}: PropsWithChildren<{ brandVariant?: PageShellVariant }>) {
  return (
    <main className="paygate-canvas min-h-dvh text-[#11110f]">
      <div className="paygate-glow paygate-glow-one" aria-hidden="true" />
      <div className="paygate-glow paygate-glow-two" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1180px] flex-col px-5 pb-8 pt-5 sm:px-8 sm:pt-7 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <a href="/" className="group inline-flex items-center gap-3 rounded-full focus-visible:outline-offset-4" aria-label="PayGate home">
            <span className="paygate-mark" aria-hidden="true"><span>PG</span></span>
            <span>
              <span className="block text-[15px] font-bold tracking-[-0.025em]">PayGate</span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-black/40 sm:block">IEEE Sahrdaya</span>
            </span>
          </a>

          <div className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/55 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-black/55 backdrop-blur-xl">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" />
            {labels[brandVariant]}
          </div>
        </header>
        <div className="flex flex-1 items-center py-8 sm:py-12 lg:py-14">
          <section className="paygate-surface mx-auto w-full max-w-[620px]">
            {children}
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/8 pt-4 text-[11px] font-medium text-black/38">
          <span>Exact-amount verification · server-authoritative status</span>
          <span>PayGate / IEEE Sahrdaya</span>
        </footer>
      </div>
    </main>
  );
}
