import type { PaperWithAnalysis } from "./api";

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function humanDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function relativeTime(iso?: string | null): string {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function slugify(text: string, max = 60): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max) || "research"
  );
}

export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** BibTeX entries for the analysed corpus, keyed firstauthorYEARfirstword. */
export function toBibTeX(papers: PaperWithAnalysis[]): string {
  const used = new Set<string>();
  const esc = (s: string) => s.replace(/[{}]/g, "").replace(/&/g, "\\&");
  return papers
    .map((p) => {
      const surname = (p.authors[0] || "anon").split(/[\s,]+/).filter(Boolean).pop() || "anon";
      const word = (p.title.match(/[A-Za-z]{4,}/) || ["paper"])[0];
      let key = `${surname}${p.year ?? "nd"}${word}`.toLowerCase().replace(/[^a-z0-9]/g, "");
      while (used.has(key)) key += "a";
      used.add(key);
      const fields = [
        `  title = {${esc(p.title)}}`,
        p.authors.length ? `  author = {${p.authors.map(esc).join(" and ")}}` : null,
        p.year ? `  year = {${p.year}}` : null,
        p.doi ? `  doi = {${p.doi}}` : null,
        p.pdf_url ? `  url = {${p.pdf_url}}` : null,
        `  note = {ResearchMate ${p.label}}`,
      ].filter(Boolean);
      return `@article{${key},\n${fields.join(",\n")}\n}`;
    })
    .join("\n\n");
}
