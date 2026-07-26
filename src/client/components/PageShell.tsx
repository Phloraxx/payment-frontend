import type { PropsWithChildren } from 'react';

import { BrandPanel } from './BrandPanel';

export function PageShell({ children }: PropsWithChildren) {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#f8fafc] px-5 py-8 text-slate-900 sm:px-8 lg:flex lg:items-center lg:px-12 lg:py-12">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-16 xl:gap-20">
        <BrandPanel />
        <section className="relative mx-auto w-full max-w-md lg:col-span-5 lg:mx-0">
          <div className="absolute inset-0 -z-10 rotate-2 scale-[1.03] rounded-[3rem] bg-slate-200/60 blur-2xl" />
          <div className="relative overflow-hidden rounded-[2.5rem] border border-slate-200/80 bg-white p-7 shadow-[0_30px_70px_-25px_rgba(15,23,42,0.20)] sm:p-9">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
