"use client";

import { cn } from "@/lib/utils";

export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20", className)}>
      {children}
    </section>
  );
}

export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-[#f2a43a]">
      {children}
    </div>
  );
}

export function SectionHead({
  kicker,
  title,
  sub,
  className,
}: {
  kicker?: string;
  title: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {kicker && <Kicker>{kicker}</Kicker>}
      <h2 className="text-balance text-3xl font-semibold tracking-tight text-[#f0ece4] sm:text-4xl">
        {title}
      </h2>
      {sub && <p className="mt-3 text-[15px] leading-relaxed text-[#a89f91]">{sub}</p>}
    </div>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.06] bg-[#14100d] p-5 transition-colors sm:p-6",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Bullet({
  title,
  text,
  icon: Icon,
}: {
  title: string;
  text: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#14100d] p-4">
      <div className="flex items-center gap-2 pb-0.5 text-[14px] font-semibold text-[#f0ece4]">
        {Icon ? (
          <Icon className="h-4 w-4 shrink-0 text-[#f2a43a]" />
        ) : (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#f2a43a]" />
        )}
        {title}
      </div>
      <p className="pl-6 text-[13px] leading-relaxed text-[#a89f91]">{text}</p>
    </div>
  );
}

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-[#a89f91]",
        className
      )}
    >
      {children}
    </span>
  );
}

/* Tiny animated EQ used across mocks */
export function EqBars({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <span className={cn("flex h-4 items-end gap-[2px]", className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="eq-bar w-[3px] rounded-sm bg-[#f2a43a]"
          style={{
            height: "100%",
            animationDelay: `${(i % 5) * 0.13 + (i % 3) * 0.07}s`,
            animationDuration: `${0.9 + (i % 4) * 0.18}s`,
          }}
        />
      ))}
    </span>
  );
}
