import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import { ThemeToggle } from "@/components/ThemeToggle";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ResearchMate — AI Research Assistant",
  description:
    "Autonomous agentic AI research assistant that retrieves, analyzes, and synthesizes academic literature to identify cross-paper research gaps with explicit citation evidence trails.",
  keywords: [
    "AI research",
    "literature review",
    "research gaps",
    "academic papers",
    "multi-agent AI",
    "LangGraph",
  ],
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const saved = localStorage.getItem('researchmate_theme');
                if (saved === 'light') {
                  document.documentElement.classList.remove('dark');
                } else {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col antialiased">
        {/* ── Ambient Background Glow ── */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div
            className="absolute -top-[40%] -left-[20%] w-[70%] h-[70%] rounded-full opacity-[0.07] dark:opacity-[0.07]"
            style={{
              background:
                "radial-gradient(circle, var(--gradient-start), transparent 70%)",
            }}
          />
          <div
            className="absolute -bottom-[30%] -right-[10%] w-[60%] h-[60%] rounded-full opacity-[0.05] dark:opacity-[0.05]"
            style={{
              background:
                "radial-gradient(circle, var(--gradient-end), transparent 70%)",
            }}
          />
        </div>

        {/* ── Navbar ── */}
        <header className="sticky top-0 z-50 glass border-b border-border/50">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            {/* Logo & Branding */}
            <Link
              href="/"
              className="flex items-center gap-3 group"
              id="navbar-logo"
            >
              <div className="relative w-9 h-9 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 shrink-0">
                <Image
                  src="/icon.png"
                  alt="ResearchMate Logo"
                  width={36}
                  height={36}
                  priority
                  className="w-9 h-9 object-contain drop-shadow"
                />
              </div>
              <span className="text-xl font-bold tracking-tight text-foreground">
                Research<span className="gradient-text">Mate</span>
              </span>
            </Link>

            {/* Right Side */}
            <div className="flex items-center gap-3">
              {/* Theme Toggle Bulb */}
              <ThemeToggle />

              {/* GitHub Link */}
              <a
                href="https://github.com/shreyans-chowdry/research_mate"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-xl border border-border/60 bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors duration-200"
                id="navbar-github-link"
                aria-label="View source on GitHub"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
            </div>
          </nav>
        </header>

        {/* ── Main Content ── */}
        <main className="flex-1">{children}</main>

        {/* ── Footer ── */}
        <footer className="border-t border-border/30 py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center text-xs text-muted-foreground">
            <p>
              © {new Date().getFullYear()} ResearchMate — Autonomous Agentic AI
              Research Assistant
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
