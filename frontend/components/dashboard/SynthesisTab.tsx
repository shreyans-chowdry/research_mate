"use client";

import { motion } from "motion/react";
import { useDashboard } from "./DashboardContext";
import Markdown from "./Markdown";

const TITLES: Record<string, { title: string; question: string }> = {
  methodology: { title: "Methods", question: "How do the papers attack the problem?" },
  dataset: { title: "Data and benchmarks", question: "What do they test on, and is it comparable?" },
  results: { title: "Results", question: "What did they find, and where do they disagree?" },
};

export default function SynthesisTab() {
  const { comparisons } = useDashboard();

  if (!comparisons.length) {
    return <p className="py-20 text-center text-muted-foreground">No comparison was produced for this review.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="hidden lg:sticky lg:top-36 lg:block lg:self-start" aria-label="Comparison sections">
        <ul className="space-y-1 border-l border-border">
          {comparisons.map((c) => (
            <li key={c.dimension}>
              <a href={`#dim-${c.dimension}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-sm text-muted-foreground transition-colors hover:border-flare hover:text-foreground">
                {TITLES[c.dimension]?.title ?? c.dimension}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="max-w-3xl space-y-14">
        {comparisons.map((c, i) => {
          const meta = TITLES[c.dimension] ?? { title: c.dimension, question: "" };
          return (
            <motion.section
              key={c.dimension}
              id={`dim-${c.dimension}`}
              className="scroll-mt-36"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <h2 className="font-display text-[2rem] leading-tight tracking-[-0.015em] text-foreground">{meta.title}</h2>
              {meta.question && <p className="mt-1 text-muted-foreground">{meta.question}</p>}
              <div className="mt-5">
                <Markdown content={c.summary} />
              </div>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}
