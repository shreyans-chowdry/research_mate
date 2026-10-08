"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, RotateCcw } from "lucide-react";
import { askCorpus, type AskAnswer, type AskTurn } from "@/lib/api";
import { useDashboard } from "./DashboardContext";
import Markdown from "./Markdown";
import { LogoMark } from "@/components/brand/Logo";

interface Message {
  role: "user" | "assistant" | "error";
  content: string;
  citations?: AskAnswer["citations"];
}

const SUGGESTIONS = [
  "Which datasets and benchmarks come up most often?",
  "Where do these papers disagree with each other?",
  "Which gap would make the strongest thesis topic, and why?",
  "Summarise the best reported results and how they were measured.",
];

export default function AskTab() {
  const { projectId, topic, papers } = useDashboard();
  const storageKey = `researchmate_ask_${projectId}`;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.filter((m) => m.role !== "error").slice(-30)));
    } catch {}
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, storageKey]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    const history: AskTurn[] = messages
      .filter((m) => m.role !== "error")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setBusy(true);
    try {
      const res = await askCorpus(projectId, q, history);
      setMessages((m) => [...m, { role: "assistant", content: res.answer_markdown, citations: res.citations }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "error", content: err instanceof Error ? err.message : "The question couldn't be answered." }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      {messages.length === 0 ? (
        <div className="py-8">
          <h2 className="font-display text-[2rem] leading-tight tracking-[-0.015em]">Ask the {papers.length} papers</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Answers come only from this review on “{topic}”. Every claim is tagged with the paper it came from, and the
            assistant will say so when the papers don’t cover something.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s, i) => (
              <motion.button
                key={s}
                type="button"
                onClick={() => send(s)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="rounded-xl border border-border bg-card p-4 text-left text-[15px] text-foreground/85 transition-colors hover:border-border-strong hover:bg-muted/50 hover:text-foreground"
              >
                {s}
              </motion.button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8 pb-6 pt-2">
          <div className="flex justify-end">
            <button type="button" onClick={() => setMessages([])} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> New conversation
            </button>
          </div>
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                {m.role === "user" ? (
                  <div className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[15px] text-foreground">{m.content}</p>
                  </div>
                ) : m.role === "error" ? (
                  <p className="rounded-xl border border-[color-mix(in_oklab,var(--ember)_35%,transparent)] bg-[var(--ember-soft)] px-4 py-3 text-sm text-foreground">
                    {m.content}
                  </p>
                ) : (
                  <div className="flex gap-3">
                    <LogoMark size={26} className="mt-1 flex-none text-foreground" />
                    <div className="min-w-0 flex-1">
                      <Markdown content={m.content} compact />
                      {m.citations && m.citations.length > 0 && (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Drawn from {m.citations.map((c) => c.label).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {busy && (
            <div className="flex items-center gap-3">
              <LogoMark size={26} busy className="flex-none text-foreground" />
              <span className="shimmer-text text-[15px]">Reading the papers</span>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="sticky bottom-4 mt-4"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-border-strong bg-card/95 p-2 pl-4 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.7)] backdrop-blur-md focus-within:border-[color-mix(in_oklab,var(--aurora)_55%,transparent)]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Ask about methods, results, datasets, disagreements…"
            aria-label="Question for the corpus"
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent py-2.5 focus-visible:outline-none text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button type="submit" disabled={!input.trim() || busy} className="btn-flare grid h-11 w-11 flex-none place-items-center" aria-label="Send question">
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
