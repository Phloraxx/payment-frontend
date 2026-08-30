import type { PropsWithChildren } from 'react';

export type PageShellVariant = 'direct-upi' | 'razorpay-test' | 'razorpay-live';

const labels: Record<PageShellVariant, string> = {
  'direct-upi': 'Secure payment',
  'razorpay-test': 'Sandbox',
  'razorpay-live': 'Live pilot',
};

export function PageShell({
  children,
  brandVariant = 'direct-upi',
}: PropsWithChildren<{ brandVariant?: PageShellVariant }>) {
  return (
    <main className="paygate-canvas min-h-dvh text-[#171814]">
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col px-5 pb-6 pt-5 sm:px-8 sm:pt-7 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <a href="/" className="group inline-flex items-center gap-3 rounded-full focus-visible:outline-offset-4" aria-label="PayGate home">
            <span className="paygate-mark" aria-hidden="true"><span>PG</span></span>
            <span>
              <span className="block text-[15px] font-extrabold tracking-[-0.035em]">PayGate</span>
              <span className="hidden text-[10px] font-semibold tracking-[0.01em] text-black/38 sm:block">IEEE Sahrdaya</span>
            </span>
          </a>
          <div className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/72 px-3 py-1.5 text-[11px] font-bold text-black/50 backdrop-blur-xl">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {labels[brandVariant]}
          </div>
        </header>

        <div className="flex flex-1 items-center py-7 sm:py-10 lg:py-12">
          <section className="paygate-surface mx-auto w-full max-w-[610px]">
            {children}
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 pt-2 text-[10px] font-medium text-black/32">
          <span>Protected by PayGate</span>
          <span>IEEE Sahrdaya</span>
        </footer>
      </div>
    </main>
  );
}
