"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { downloadText, slugify } from "@/lib/format";
import { useDashboard } from "./DashboardContext";

const COLUMNS = [
  { key: "problem", label: "Problem" },
  { key: "methodology", label: "Method" },
  { key: "dataset", label: "Data" },
  { key: "results", label: "Results" },
  { key: "limitations", label: "Limitations" },
  { key: "future_work", label: "Future work" },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

export default function MatrixTab() {
  const { papers, goToPaper, topic } = useDashboard();
  const [cols, setCols] = useState<Set<ColKey>>(new Set(["methodology", "dataset", "results", "limitations"]));
  const [expanded, setExpanded] = useState(false);

  const visible = COLUMNS.filter((c) => cols.has(c.key));

  const exportCsv = () => {
    const q = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const header = ["Label", "Title", "Year", ...COLUMNS.map((c) => c.label)].map(q).join(",");
    const rows = papers.map((p) =>
      [p.label, p.title, String(p.year ?? ""), ...COLUMNS.map((c) => (p.analysis?.[c.key] as string) ?? "")].map(q).join(",")
    );
    downloadText(`${slugify(topic)}-matrix.csv`, [header, ...rows].join("\n"), "text/csv;charset=utf-8");
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Columns">
          {COLUMNS.map((c) => {
            const on = cols.has(c.key);
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setCols((s) => {
                    const n = new Set(s);
                    if (n.has(c.key) && n.size > 1) n.delete(c.key);
                    else n.add(c.key);
                    return n;
                  })
                }
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  on ? "border-border-strong bg-muted text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setExpanded((e) => !e)} className="btn-quiet h-9 px-3 text-sm">
            {expanded ? "Compact rows" : "Show full text"}
          </button>
          <button type="button" onClick={exportCsv} className="btn-quiet flex h-9 items-center gap-2 px-3 text-sm">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-[14px] leading-relaxed">
          <thead>
            <tr className="border-b border-border-strong">
              <th className="sticky left-0 z-10 w-64 bg-card px-4 py-3 font-semibold text-foreground">Paper</th>
              {visible.map((c) => (
                <th key={c.key} className="px-4 py-3 font-semibold text-foreground">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {papers.map((p) => (
              <tr key={p.id} className="border-b border-border align-top transition-colors last:border-0 hover:bg-muted/30">
                <th scope="row" className="sticky left-0 z-10 w-64 bg-card px-4 py-3 font-normal">
                  <button type="button" onClick={() => goToPaper(p.id)} className="text-left">
                    <span className="mr-2 text-sm font-bold text-flare">{p.label}</span>
                    <span className="font-display text-[15px] text-foreground hover:underline">{p.title}</span>
                    {p.year && <span className="mt-0.5 block text-xs text-muted-foreground">{p.year}</span>}
                  </button>
                </th>
                {visible.map((c) => {
                  const v = (p.analysis?.[c.key] as string) || "";
                  const missing = !v || v.startsWith("Not reported");
                  return (
                    <td key={c.key} className={`px-4 py-3 ${missing ? "italic text-muted-foreground" : "text-foreground/85"}`} title={expanded ? undefined : v}>
                      <span className={expanded ? "" : "line-clamp-4"}>{missing ? "Not stated" : v}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
