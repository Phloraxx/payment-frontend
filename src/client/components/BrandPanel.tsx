import { Lightning, ShieldCheck } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

export type BrandPanelVariant = 'direct-upi' | 'razorpay-test' | 'razorpay-live';

const content = {
  'direct-upi': {
    badge: 'UPI payment verification',
    description: 'Generate a UPI payment, pay the exact amount shown, and let PayGate verify the bank transfer automatically.',
    cards: [
      {
        title: 'Exact verification',
        description: 'A small paise adjustment uniquely identifies your active payment without exposing bank evidence to this page.',
      },
      {
        title: 'Automatic confirmation',
        description: 'PayGate watches the bank credit and updates this page automatically while the payment is active.',
      },
    ],
  },
  'razorpay-test': {
    badge: 'Razorpay Custom Checkout',
    description: 'Choose an enabled bank inside the IEEE portal, then complete only the secure bank-authentication step through Razorpay.',
    cards: [
      {
        title: 'Portal-controlled flow',
        description: 'Amount and bank selection remain in the IEEE interface instead of a Razorpay payment-method popup.',
      },
      {
        title: 'Server-verified result',
        description: 'The signed Razorpay response is verified by the server before the test payment is shown as captured.',
      },
    ],
  },
  'razorpay-live': {
    badge: 'Razorpay Live ₹1 pilot',
    description: 'A hidden, server-capped Live Mode checkout for validating one real ₹1 payment before broader activation.',
    cards: [
      {
        title: 'Hard ₹1 limit',
        description: 'Both the portal and isolated Live service reject every amount except exactly ₹1 during the pilot.',
      },
      {
        title: 'Signed verification',
        description: 'The Live callback and webhook are verified independently before the transaction is shown as captured.',
      },
    ],
  },
} satisfies Record<BrandPanelVariant, {
  badge: string;
  description: string;
  cards: [{ title: string; description: string }, { title: string; description: string }];
}>;

export function BrandPanel({ variant = 'direct-upi' }: { variant?: BrandPanelVariant }) {
  const selected = content[variant];
  return (
    <section className="lg:col-span-7 flex flex-col justify-center">
      <div className="space-y-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-slate-900/5 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">{selected.badge}</span>
        </div>
        <div>
          <img src="/Ieee.svg" alt="IEEE Sahrdaya" className="mb-5 h-12 w-auto max-w-full object-contain object-left" />
          <h1 className="text-5xl font-bold leading-[0.92] tracking-[-0.055em] text-slate-950 sm:text-6xl lg:text-7xl">
            IEEE Sahrdaya
            <br />
            <span className="text-slate-400">Payment Portal.</span>
          </h1>
        </div>
        <p className="max-w-[52ch] text-lg leading-relaxed text-slate-600">{selected.description}</p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <InfoCard icon={<ShieldCheck weight="duotone" className="h-7 w-7" />} {...selected.cards[0]} />
        <InfoCard icon={<Lightning weight="duotone" className="h-7 w-7" />} {...selected.cards[1]} />
      </div>
    </section>
  );
}

function InfoCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <article className="rounded-[2rem] border border-slate-200/70 bg-white p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.25)]">
      <div className="mb-4 text-slate-900">{icon}</div>
      <h2 className="font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
    </article>
  );
}
