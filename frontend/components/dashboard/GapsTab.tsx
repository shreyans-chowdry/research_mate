"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Compass } from "lucide-react";
import type { ResearchGap, GapSeverity } from "@/lib/api";
import { useDashboard } from "./DashboardContext";

const SEVERITY: Record<GapSeverity, { label: string; r: number; desc: string }> = {
  high: { label: "High impact", r: 22, desc: "Blocks progress across several papers" },
  medium: { label: "Medium impact", r: 16, desc: "A clear but narrower opening" },
  low: { label: "Low impact", r: 11, desc: "Worth noting, smaller payoff" },
};

const SIZE = 440;
const C = SIZE / 2;
const RING = 178;

function GapMap({ gaps, active, setActive }: { gaps: ResearchGap[]; active: string | null; setActive: (id: string | null) => void }) {
  const { papers, goToPaper } = useDashboard();
  const reduce = useReducedMotion();

  const paperPos = useMemo(() => {
    const m = new Map<string, { x: number; y: number; label: string; title: string }>();
    papers.forEach((p, i) => {
      const a = -Math.PI / 2 + (i / Math.max(1, papers.length)) * Math.PI * 2;
      m.set(p.id, { x: C + RING * Math.cos(a), y: C + RING * Math.sin(a), label: p.label, title: p.title });
    });
    return m;
  }, [papers]);

  const gapPos = useMemo(() => {
    const placed: Array<{ x: number; y: number }> = [];
    return gaps.map((g, gi) => {
      const pts = g.supporting_papers.map((s) => paperPos.get(s.id)).filter(Boolean) as Array<{ x: number; y: number }>;
      // sit between the supporting papers, pulled toward the centre
      let x = C;
      let y = C;
      if (pts.length) {
        x = pts.reduce((a, p) => a + p.x, 0) / pts.length;
        y = pts.reduce((a, p) => a + p.y, 0) / pts.length;
        x = C + (x - C) * 0.45;
        y = C + (y - C) * 0.45;
      } else {
        const a = gi * 2.4;
        x = C + 40 * Math.cos(a);
        y = C + 40 * Math.sin(a);
      }
      // nudge apart from earlier gaps
      for (let k = 0; k < 30; k++) {
        const clash = placed.find((p) => Math.hypot(p.x - x, p.y - y) < 52);
        if (!clash) break;
        const ang = Math.atan2(y - clash.y, x - clash.x) || gi;
        x += Math.cos(ang) * 14;
        y += Math.sin(ang) * 14;
      }
      placed.push({ x, y });
      return { x, y };
    });
  }, [gaps, paperPos]);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" role="img" aria-label="Map of research gaps and the papers that support them">
      <circle cx={C} cy={C} r={RING} fill="none" stroke="var(--border)" />
      <circle cx={C} cy={C} r={RING * 0.55} fill="none" stroke="var(--border)" strokeDasharray="2 6" />

      {/* evidence lines */}
      {gaps.map((g, gi) =>
        g.supporting_papers.map((s) => {
          const p = paperPos.get(s.id);
          if (!p) return null;
          const on = active === g.id;
          return (
            <motion.line
              key={`${g.id}-${s.id}`}
              x1={gapPos[gi].x}
              y1={gapPos[gi].y}
              x2={p.x}
              y2={p.y}
              stroke={on ? "var(--flare)" : "var(--border-strong)"}
              strokeWidth={on ? 1.6 : 1}
              strokeOpacity={active && !on ? 0.25 : 1}
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, delay: 0.3 + gi * 0.12 }}
            />
          );
        })
      )}

      {/* papers on the ring */}
      {[...paperPos.entries()].map(([id, p], i) => {
        const lit = active ? gaps.find((g) => g.id === active)?.supporting_papers.some((s) => s.id === id) : false;
        return (
          <g key={id} className="cursor-pointer" onClick={() => goToPaper(id)}>
            <title>{`${p.label}: ${p.title}`}</title>
            <motion.circle
              cx={p.x}
              cy={p.y}
              r={lit ? 15 : 13}
              fill="var(--card)"
              stroke={lit ? "var(--flare)" : "var(--border-strong)"}
              initial={reduce ? false : { opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              style={{ originX: `${p.x}px`, originY: `${p.y}px` }}
            />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight={700} fill={lit ? "var(--flare)" : "var(--muted-foreground)"} className="font-sans">
              {p.label}
            </text>
          </g>
        );
      })}

      {/* gaps */}
      {gaps.map((g, gi) => {
        const { x, y } = gapPos[gi];
        const sev = SEVERITY[g.severity] ?? SEVERITY.medium;
        const on = active === g.id;
        return (
          <g
            key={g.id}
            className="cursor-pointer"
            onMouseEnter={() => setActive(g.id)}
            onMouseLeave={() => setActive(null)}
            onClick={() => document.getElementById(`gap-${g.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
          >
            <title>{g.title}</title>
            {!reduce && (
              <motion.circle
                cx={x}
                cy={y}
                fill="none"
                stroke="var(--flare-fill)"
                initial={{ r: sev.r, opacity: 0.5 }}
                animate={{ r: sev.r + 14, opacity: 0 }}
                transition={{ duration: 2.4, repeat: Infinity, delay: gi * 0.5, ease: "easeOut" }}
              />
            )}
            <motion.circle
              cx={x}
              cy={y}
              fill="var(--flare-soft)"
              stroke="var(--flare-fill)"
              strokeWidth={on ? 2.5 : 1.5}
              initial={reduce ? false : { r: 0 }}
              animate={{ r: on ? sev.r + 3 : sev.r }}
              transition={{ type: "spring", stiffness: 260, damping: 16, delay: on ? 0 : 0.5 + gi * 0.12 }}
            />
            <text x={x} y={y + 4.5} textAnchor="middle" fontSize="13" fontWeight={700} fill="var(--flare)" className="font-sans">
              {gi + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function GapsTab() {
  const { gaps, goToPaper, papers } = useDashboard();
  const [active, setActive] = useState<string | null>(null);

  if (!gaps.length) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        No gaps were recorded for this review. Run it again from the header to regenerate them.
      </div>
    );
  }

  const label = (id: string) => papers.find((p) => p.id === id)?.label ?? "?";

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-36 lg:self-start">
        <GapMap gaps={gaps} active={active} setActive={setActive} />
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Papers sit on the ring. Each gap is placed in the space between the papers that point to it; bigger halos mark
          higher impact. Hover a gap to trace its evidence, click a paper to open it.
        </p>
      </div>

      <ol className="space-y-4">
        {gaps.map((g, i) => {
          const sev = SEVERITY[g.severity] ?? SEVERITY.medium;
          const on = active === g.id;
          return (
            <motion.li
              key={g.id}
              id={`gap-${g.id}`}
              onMouseEnter={() => setActive(g.id)}
              onMouseLeave={() => setActive(null)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07 }}
              className={`panel scroll-mt-40 p-6 transition-[border-color,box-shadow] duration-300 ${
                on ? "border-[color-mix(in_oklab,var(--flare)_55%,transparent)] shadow-[0_0_0_4px_var(--flare-soft)]" : ""
              }`}
            >
              <div className="flex items-start gap-4">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-full border border-[color-mix(in_oklab,var(--flare)_45%,transparent)] bg-[var(--flare-soft)] font-display text-lg text-flare">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="font-display text-[1.4rem] leading-snug text-foreground">{g.title}</h3>
                    <span className="text-sm text-muted-foreground" title={sev.desc}>
                      {sev.label}
                    </span>
                  </div>
                  <p className="mt-2 leading-relaxed text-foreground/85">{g.description}</p>

                  <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Compass className="h-4 w-4 text-aurora" /> A study that would close it
                    </p>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-foreground/85">{g.suggested_direction}</p>
                  </div>

                  <div className="mt-4">
                    {g.supporting_papers.length ? (
                      <div className="flex flex-wrap gap-2">
                        {g.supporting_papers.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => goToPaper(s.id)}
                            className="group flex max-w-full items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-left text-sm transition-colors hover:border-[color-mix(in_oklab,var(--flare)_45%,transparent)] hover:bg-[var(--flare-soft)]"
                          >
                            <span className="font-bold text-flare">{label(s.id)}</span>
                            <span className="truncate text-foreground/80 group-hover:text-foreground">{s.title}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No single paper was cited as direct evidence, so treat this one as a hypothesis to check.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
