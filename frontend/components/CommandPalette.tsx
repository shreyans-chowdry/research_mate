"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Search, Plus, SunMoon, FileText, CornerDownLeft } from "lucide-react";
import { listResearchProjects, ProjectSummary } from "@/lib/api";
import { relativeTime } from "@/lib/format";

export interface Command {
  id: string;
  label: string;
  group: string;
  hint?: string;
  keywords?: string;
  icon?: React.ReactNode;
  run: () => void;
}

interface PaletteApi {
  open: () => void;
  register: (key: string, commands: Command[]) => void;
  unregister: (key: string) => void;
}

const PaletteContext = createContext<PaletteApi>({ open: () => {}, register: () => {}, unregister: () => {} });

export function useCommandPalette() {
  return useContext(PaletteContext);
}

/** Register page-specific commands for as long as the calling component is mounted. */
export function useCommands(key: string, commands: Command[]) {
  const { register, unregister } = useCommandPalette();
  useEffect(() => {
    register(key, commands);
    return () => unregister(key);
  }, [key, commands, register, unregister]);
}

function score(cmd: Command, q: string): number {
  if (!q) return 1;
  const hay = `${cmd.label} ${cmd.keywords ?? ""} ${cmd.group}`.toLowerCase();
  const needle = q.toLowerCase().trim();
  if (hay.includes(needle)) return 3 - hay.indexOf(needle) / 200;
  // loose subsequence match
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length ? 1 : 0;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [registry, setRegistry] = useState<Record<string, Command[]>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const register = useCallback((key: string, cmds: Command[]) => setRegistry((r) => ({ ...r, [key]: cmds })), []);
  const unregister = useCallback(
    (key: string) =>
      setRegistry((r) => {
        const next = { ...r };
        delete next[key];
        return next;
      }),
    []
  );
  const open = useCallback(() => {
    setQuery("");
    setActive(0);
    setOpen(true);
    listResearchProjects().then(setProjects).catch(() => setProjects([]));
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) setOpen(false);
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, open]);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      {
        id: "new",
        label: "Start a new review",
        group: "Actions",
        keywords: "new research topic search home",
        icon: <Plus className="h-4 w-4" />,
        run: () => {
          router.push("/");
          setTimeout(() => document.getElementById("topic-input")?.focus(), 120);
        },
      },
      {
        id: "theme",
        label: "Switch light / dark theme",
        group: "Actions",
        keywords: "theme dark light mode",
        icon: <SunMoon className="h-4 w-4" />,
        run: () => {
          const dark = !document.documentElement.classList.contains("dark");
          document.documentElement.classList.toggle("dark", dark);
          try {
            localStorage.setItem("researchmate_theme", dark ? "dark" : "light");
          } catch {}
        },
      },
    ];
    const page = Object.values(registry).flat();
    const recent: Command[] = projects.slice(0, 12).map((p) => ({
      id: `p-${p.id}`,
      label: p.topic,
      group: "Reviews",
      hint: p.status === "done" ? relativeTime(p.created_at) : p.status === "error" ? "Stopped" : "Running",
      icon: <FileText className="h-4 w-4" />,
      run: () => router.push(`/project/${p.id}`),
    }));
    return [...page, ...base, ...recent];
  }, [registry, projects, router]);

  const results = useMemo(
    () =>
      commands
        .map((c) => ({ c, s: score(c, query) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.c)
        .slice(0, 30),
    [commands, query]
  );

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (cmd?: Command) => {
    if (!cmd) return;
    setOpen(false);
    cmd.run();
  };

  const groups = useMemo(() => {
    const out: Array<{ name: string; items: Array<{ cmd: Command; index: number }> }> = [];
    results.forEach((cmd, index) => {
      let g = out.find((x) => x.name === cmd.group);
      if (!g) out.push((g = { name: cmd.group, items: [] }));
      g.items.push({ cmd, index });
    });
    return out;
  }, [results]);

  return (
    <PaletteContext.Provider value={{ open, register, unregister }}>
      {children}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="no-print fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[14vh]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="absolute inset-0 bg-[#050a17]/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Command palette"
              className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border-strong bg-card shadow-[0_40px_120px_-30px_rgba(0,0,0,0.75)]"
              initial={{ y: -12, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: -8, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(results.length - 1, a + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  run(results[active]);
                }
              }}
            >
              <div className="flex items-center gap-3 border-b border-border px-4">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  placeholder="Jump to a review, a tab, or an action"
                  className="h-14 flex-1 bg-transparent focus-visible:outline-none text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                  aria-label="Search commands"
                />
                <span className="kbd">esc</span>
              </div>
              <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
                {results.length === 0 && (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</p>
                )}
                {groups.map((g) => (
                  <div key={g.name} className="mb-1">
                    <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">{g.name}</p>
                    {g.items.map(({ cmd, index }) => (
                      <button
                        key={cmd.id}
                        type="button"
                        data-index={index}
                        onMouseMove={() => setActive(index)}
                        onClick={() => run(cmd)}
                        className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                          index === active ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {index === active && (
                          <motion.span
                            layoutId="palette-active"
                            className="absolute inset-0 rounded-lg bg-muted"
                            transition={{ type: "spring", stiffness: 500, damping: 38 }}
                          />
                        )}
                        <span className="relative">{cmd.icon}</span>
                        <span className="relative flex-1 truncate">{cmd.label}</span>
                        {cmd.hint && <span className="relative text-xs text-muted-foreground">{cmd.hint}</span>}
                        {index === active && <CornerDownLeft className="relative h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PaletteContext.Provider>
  );
}
