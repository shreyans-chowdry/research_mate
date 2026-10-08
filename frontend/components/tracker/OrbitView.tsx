"use client";

import { motion, useReducedMotion, AnimatePresence } from "motion/react";

export const STAGES = [
  { key: "pending", name: "Plan", agent: "Query" },
  { key: "searching", name: "Retrieve", agent: "Retrieval" },
  { key: "analyzing", name: "Read", agent: "Extraction" },
  { key: "comparing", name: "Compare", agent: "Comparison" },
  { key: "gap_finding", name: "Find gaps", agent: "Gaps" },
  { key: "reporting", name: "Report", agent: "Report" },
] as const;

const W = 740;
const H = 400;
const CX = W / 2;
const CY = H / 2 + 6;
const RX = 255;
const RY = 140;

/** Ellipse starting at the left-most point and running clockwise. */
/** SVG coordinates are rounded so server and browser render identical markup. */
const r2 = (n: number) => Math.round(n * 100) / 100;

const ORBIT = `M ${CX - RX} ${CY} a ${RX} ${RY} 0 1 1 ${2 * RX} 0 a ${RX} ${RY} 0 1 1 ${-2 * RX} 0`;

// Arc-length table so stations sit at equal *distances* along the orbit,
// which is what pathLength (the lit progress arc) measures.
const ARC_TABLE = (() => {
  const steps = 720;
  const pts: Array<{ t: number; s: number }> = [{ t: Math.PI, s: 0 }];
  let s = 0;
  let prev = { x: CX - RX, y: CY };
  for (let k = 1; k <= steps; k++) {
    const t = Math.PI + (k / steps) * 2 * Math.PI;
    const cur = { x: CX + RX * Math.cos(t), y: CY + RY * Math.sin(t) };
    s += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    pts.push({ t, s });
    prev = cur;
  }
  return pts.map((p) => ({ t: p.t, f: p.s / s }));
})();

function stationPoint(i: number) {
  const f = i / STAGES.length;
  const hit = ARC_TABLE.find((p) => p.f >= f) ?? ARC_TABLE[0];
  return { x: r2(CX + RX * Math.cos(hit.t)), y: r2(CY + RY * Math.sin(hit.t)) };
}

function paperPoint(i: number) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const r = 14 * Math.sqrt(i + 0.6);
  const a = i * golden;
  return { x: r2(CX + r * Math.cos(a) * 1.25), y: r2(CY + r * Math.sin(a) * 0.85) };
}

interface Props {
  stageIndex: number; // 0-5 running, 6 done
  failed: boolean;
  papersFound: number;
  papersRead: number;
}

export default function OrbitView({ stageIndex, failed, papersFound, papersRead }: Props) {
  const reduce = useReducedMotion();
  const done = stageIndex >= STAGES.length;
  const progress = done ? 1 : stageIndex / STAGES.length;
  const running = !done && !failed;
  const papers = Math.min(papersFound, 24);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Pipeline progress: ${done ? "complete" : `stage ${stageIndex + 1} of 6`}`}>
      <defs>
        <radialGradient id="core-glow">
          <stop offset="0%" stopColor="var(--aurora)" stopOpacity={done ? 0.28 : 0.14} />
          <stop offset="100%" stopColor="var(--aurora)" stopOpacity="0" />
        </radialGradient>
        <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <ellipse cx={CX} cy={CY} rx={150} ry={95} fill="url(#core-glow)" />

      {/* faint inner rings, like a star chart */}
      {[0.45, 0.72].map((k) => (
        <ellipse key={k} cx={CX} cy={CY} rx={RX * k} ry={RY * k} fill="none" stroke="var(--border)" strokeDasharray="2 6" />
      ))}

      {/* orbit track */}
      <path d={ORBIT} fill="none" stroke="var(--border-strong)" strokeWidth="1.5" />

      {/* completed portion of the orbit */}
      <motion.path
        d={ORBIT}
        fill="none"
        stroke={failed ? "var(--ember)" : "var(--aurora)"}
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: progress }}
        transition={{ duration: reduce ? 0 : 1.2, ease: [0.65, 0, 0.35, 1] }}
      />

      {/* comet travelling the orbit while agents work */}
      {running && !reduce && (
        <g>
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <circle key={k} r={5 - k * 0.7} fill="var(--aurora)" opacity={1 - k * 0.17} filter={k === 0 ? "url(#soft-glow)" : undefined}>
              <animateMotion dur="5.5s" repeatCount="indefinite" path={ORBIT} begin={`${-k * 0.06}s`} />
            </circle>
          ))}
          <circle r="2.6" fill="var(--foreground)">
            <animateMotion dur="5.5s" repeatCount="indefinite" path={ORBIT} />
          </circle>
        </g>
      )}

      {/* stations */}
      {STAGES.map((s, i) => {
        const p = stationPoint(i);
        const state = done || i < stageIndex ? "done" : i === stageIndex ? (failed ? "failed" : "active") : "queued";
        const color =
          state === "done" ? "var(--aurora)" : state === "active" ? "var(--flare-fill)" : state === "failed" ? "var(--ember)" : "var(--border-strong)";
        const outwardX = p.x - CX;
        const outwardY = p.y - CY;
        const len = Math.hypot(outwardX, outwardY) || 1;
        const lx = r2(p.x + (outwardX / len) * 26);
        const ly = r2(p.y + (outwardY / len) * 26 + 4);
        const anchor = Math.abs(outwardX) < 40 ? "middle" : outwardX > 0 ? "start" : "end";
        return (
          <g key={s.key}>
            {state === "active" && !reduce && (
              <motion.circle
                cx={p.x}
                cy={p.y}
                r={10}
                fill="none"
                stroke="var(--flare-fill)"
                initial={{ r: 10, opacity: 0.8 }}
                animate={{ r: 24, opacity: 0 }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <motion.circle
              cx={p.x}
              cy={p.y}
              fill="var(--card)"
              stroke={color}
              strokeWidth={2}
              initial={false}
              animate={{ r: state === "active" ? 11 : 9 }}
            />
            {state === "done" && (
              <motion.path
                d={`M ${p.x - 4} ${p.y} l 3 3 l 5 -6`}
                fill="none"
                stroke="var(--aurora)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              />
            )}
            {state === "active" && <circle cx={p.x} cy={p.y} r={3.5} fill="var(--flare-fill)" />}
            {state === "failed" && (
              <path d={`M ${p.x - 3.5} ${p.y - 3.5} l 7 7 M ${p.x + 3.5} ${p.y - 3.5} l -7 7`} stroke="var(--ember)" strokeWidth="2" strokeLinecap="round" />
            )}
            <text
              x={lx}
              y={ly}
              textAnchor={anchor}
              className="font-sans"
              fontSize="17"
              fontWeight={state === "active" ? 700 : 500}
              fill={state === "queued" ? "var(--muted-foreground)" : "var(--foreground)"}
            >
              {s.name}
            </text>
          </g>
        );
      })}

      {/* the corpus: one star per paper found */}
      <AnimatePresence>
        {Array.from({ length: papers }).map((_, i) => {
          const p = paperPoint(i);
          const read = i < papersRead;
          return (
            <motion.g key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15, delay: i * 0.05 }} style={{ originX: `${p.x}px`, originY: `${p.y}px` }}>
              {read && <circle cx={p.x} cy={p.y} r={7} fill="none" stroke="var(--aurora)" strokeOpacity={0.6} />}
              <circle cx={p.x} cy={p.y} r={read ? 3.4 : 2.6} fill={read ? "var(--aurora)" : "var(--foreground)"} opacity={read ? 1 : 0.7} />
            </motion.g>
          );
        })}
      </AnimatePresence>

      {papers > 0 && (
        <text x={CX} y={CY + 70} textAnchor="middle" fontSize="15" fill="var(--muted-foreground)" className="font-sans">
          {papersFound} found{papersRead ? `, ${papersRead} read` : ""}
        </text>
      )}

      {papers === 0 && (
        <text x={CX} y={CY + 5} textAnchor="middle" fontSize="15" fill="var(--muted-foreground)" className="font-sans">
          {failed ? "No papers collected" : "Papers will appear here"}
        </text>
      )}

      {done && !reduce && (
        <motion.ellipse
          cx={CX}
          cy={CY}
          fill="none"
          stroke="var(--aurora)"
          initial={{ rx: 40, ry: 24, opacity: 0.9 }}
          animate={{ rx: RX + 60, ry: RY + 40, opacity: 0 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
        />
      )}
    </svg>
  );
}
