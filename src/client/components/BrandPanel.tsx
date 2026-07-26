import { Lightning, ShieldCheck } from '@phosphor-icons/react';

export function BrandPanel() {
  return (
    <section className="lg:col-span-7 flex flex-col justify-center">
      <div className="space-y-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-slate-900/5 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">UPI payment verification</span>
        </div>
        <div>
          <img src="/Ieee.svg" alt="IEEE Sahrdaya" className="mb-5 h-12 w-auto max-w-full object-contain object-left" />
          <h1 className="text-5xl font-bold leading-[0.92] tracking-[-0.055em] text-slate-950 sm:text-6xl lg:text-7xl">
            IEEE Sahrdaya
            <br />
            <span className="text-slate-400">Payment Portal.</span>
          </h1>
        </div>
        <p className="max-w-[52ch] text-lg leading-relaxed text-slate-600">
          Generate a UPI payment, pay the exact amount shown, and let PayGate verify the bank transfer automatically.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <InfoCard
          icon={<ShieldCheck weight="duotone" className="h-7 w-7" />}
          title="Exact verification"
          description="A small paise adjustment uniquely identifies your active payment without exposing bank evidence to this page."
        />
        <InfoCard
          icon={<Lightning weight="duotone" className="h-7 w-7" />}
          title="Automatic confirmation"
          description="PayGate watches the bank credit and updates this page automatically while the payment is active."
        />
      </div>
    </section>
  );
}

function InfoCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <article className="rounded-[2rem] border border-slate-200/70 bg-white p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.25)]">
      <div className="mb-4 text-slate-900">{icon}</div>
      <h2 className="font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
    </article>
  );
}
