import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { CommandPaletteProvider } from "@/components/CommandPalette";
import { ToastProvider } from "@/components/Toast";

// Self-hosted variable fonts (SIL Open Font License, see app/fonts) — no build-time network needed.
const display = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "./fonts/Newsreader-Variable.woff2", weight: "200 800", style: "normal" },
    { path: "./fonts/Newsreader-Variable-Italic.woff2", weight: "200 800", style: "italic" },
  ],
  fallback: ["Georgia", "serif"],
});

const ui = localFont({
  variable: "--font-ui",
  display: "swap",
  src: [{ path: "./fonts/HankenGrotesk-Variable.woff2", weight: "100 900", style: "normal" }],
  fallback: ["system-ui", "sans-serif"],
});

const code = localFont({
  variable: "--font-code",
  display: "swap",
  src: [{ path: "./fonts/JetBrainsMono-Variable.woff2", weight: "100 800", style: "normal" }],
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: "ResearchMate — find what the literature hasn't answered",
    template: "%s — ResearchMate",
  },
  description:
    "Give ResearchMate a topic. Its agents search four academic indexes, read the papers, compare them, and map the research gaps — every claim linked to its source.",
  keywords: ["literature review", "research gaps", "academic papers", "AI research assistant", "LangGraph"],
  applicationName: "ResearchMate",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a1226" },
    { media: "(prefers-color-scheme: light)", color: "#edf0f5" },
  ],
};

const themeScript = `
try {
  var saved = localStorage.getItem('researchmate_theme');
  var dark = saved ? saved === 'dark' : true;
  document.documentElement.classList.toggle('dark', dark);
} catch (e) { document.documentElement.classList.add('dark'); }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${code.variable} dark`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <ToastProvider>
          <CommandPaletteProvider>
            <SiteHeader />
            <main className="flex flex-1 flex-col">{children}</main>
          </CommandPaletteProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
