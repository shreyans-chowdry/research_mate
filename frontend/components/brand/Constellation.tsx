"use client";

import { useEffect, useRef } from "react";

/**
 * A live "citation sky": drifting stars (papers) linked to their neighbours.
 * - `energy` (0–1) brightens links and twinkle while the user types.
 * - `pulse` (any changing number) emits a ripple from `focus`.
 * - `warp` streaks every star away from `focus` (used when a review launches).
 * Theme colours are read from CSS variables, so it follows light/dark mode.
 */

interface Props {
  energy?: number;
  pulse?: number;
  warp?: boolean;
  /** Focal point as a fraction of the canvas (0–1). */
  focus?: { x: number; y: number };
  density?: number;
  className?: string;
}

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  tw: number; // twinkle phase
  gap: boolean; // amber "gap" star
  bright: boolean; // a few larger stars with a halo
}

interface Ripple {
  x: number;
  y: number;
  t: number;
}

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return {
    star: get("--star-rgb", "236, 231, 218"),
    flare: get("--flare-fill", "#ffb547"),
    aurora: get("--aurora", "#6ee7c2"),
  };
}

export default function Constellation({
  energy = 0,
  pulse = 0,
  warp = false,
  focus = { x: 0.3, y: 0.55 },
  density = 1,
  className = "",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef({ energy, warp, focus });
  const ripples = useRef<Ripple[]>([]);

  useEffect(() => {
    props.current = { energy, warp, focus };
  }, [energy, warp, focus]);

  useEffect(() => {
    if (!pulse) return;
    ripples.current.push({ x: focus.x, y: focus.y, t: 0 });
    if (ripples.current.length > 6) ripples.current.shift();
  }, [pulse, focus.x, focus.y]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let colors = readColors();
    let w = 0;
    let h = 0;
    let dpr = 1;
    let stars: Star[] = [];
    let raf = 0;
    let visible = true;
    let warpT = 0;
    const mouse = { x: -9999, y: -9999, active: false };

    const seed = () => {
      const count = Math.round(Math.min(190, (w * h) / 7200) * density);
      stars = Array.from({ length: count }, () => {
        // Weight the sky toward the right so text on the left stays readable.
        const bias = Math.pow(Math.random(), 0.65);
        return {
          x: (0.12 + bias * 0.88) * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.12,
          r: Math.random() < 0.08 ? Math.random() * 1.2 + 1.7 : Math.random() * 1.2 + 0.5,
          tw: Math.random() * Math.PI * 2,
          gap: Math.random() < 0.04,
          bright: false,
        };
      });
      for (const s of stars) s.bright = s.r > 1.7;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const LINK = 132;

    const frame = (time: number) => {
      const { energy: e, warp: isWarp, focus: f } = props.current;
      ctx.clearRect(0, 0, w, h);
      const fx = f.x * w;
      const fy = f.y * h;

      if (isWarp) warpT = Math.min(1, warpT + 0.018);
      else warpT = Math.max(0, warpT - 0.05);

      // move
      for (const s of stars) {
        if (warpT > 0) {
          const dx = s.x - fx;
          const dy = s.y - fy;
          const d = Math.hypot(dx, dy) || 1;
          const sp = warpT * warpT * 38;
          s.x += (dx / d) * sp;
          s.y += (dy / d) * sp;
        } else if (!reduce) {
          s.x += s.vx * (1 + e * 3);
          s.y += s.vy * (1 + e * 3);
        }
        if (mouse.active && !reduce) {
          const dx = mouse.x - s.x;
          const dy = mouse.y - s.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 160 * 160) {
            s.x += dx * 0.0016;
            s.y += dy * 0.0016;
          }
        }
        if (warpT === 0) {
          if (s.x < -20) s.x = w + 20;
          if (s.x > w + 20) s.x = -20;
          if (s.y < -20) s.y = h + 20;
          if (s.y > h + 20) s.y = -20;
        }
      }

      // links (citation edges)
      const linkAlpha = 0.11 + e * 0.2;
      ctx.lineWidth = 1;
      for (let i = 0; i < stars.length; i++) {
        const a = stars[i];
        for (let j = i + 1; j < stars.length; j++) {
          const b = stars[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK * LINK) continue;
          const alpha = (1 - Math.sqrt(d2) / LINK) * linkAlpha * (1 - warpT);
          ctx.strokeStyle = `rgba(${colors.star}, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // cursor links
      if (mouse.active && warpT === 0) {
        for (const s of stars) {
          const d = Math.hypot(mouse.x - s.x, mouse.y - s.y);
          if (d < 150) {
            ctx.strokeStyle = colors.aurora;
            ctx.globalAlpha = (1 - d / 150) * 0.35;
            ctx.beginPath();
            ctx.moveTo(mouse.x, mouse.y);
            ctx.lineTo(s.x, s.y);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      // ripples from typing
      ripples.current = ripples.current.filter((r) => r.t < 1);
      for (const r of ripples.current) {
        r.t += 0.012;
        const rad = r.t * Math.max(w, h) * 0.55;
        ctx.strokeStyle = colors.aurora;
        ctx.globalAlpha = (1 - r.t) * 0.22;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(r.x * w, r.y * h, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // stars crossed by the ring flash briefly
        for (const s of stars) {
          const d = Math.hypot(s.x - r.x * w, s.y - r.y * h);
          if (Math.abs(d - rad) < 10) s.tw = 0;
        }
      }

      // stars
      for (const s of stars) {
        s.tw += 0.02 + e * 0.05;
        const twinkle = reduce ? 0.8 : 0.55 + Math.sin(s.tw) * 0.35;
        if (warpT > 0) {
          const dx = s.x - fx;
          const dy = s.y - fy;
          const d = Math.hypot(dx, dy) || 1;
          const len = warpT * warpT * 70;
          ctx.strokeStyle = `rgba(${colors.star}, ${0.65 * (1 - warpT * 0.4)})`;
          ctx.lineWidth = s.r;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - (dx / d) * len, s.y - (dy / d) * len);
          ctx.stroke();
          continue;
        }
        if (s.gap) {
          const pulseR = 6 + Math.sin(time / 600 + s.tw) * 2.5;
          ctx.strokeStyle = colors.flare;
          ctx.globalAlpha = 0.35 + e * 0.3;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(s.x, s.y, pulseR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = colors.flare;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r + 0.6, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        if (s.bright) {
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
          g.addColorStop(0, `rgba(${colors.star}, ${0.35 * twinkle})`);
          g.addColorStop(1, `rgba(${colors.star}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(${colors.star}, ${Math.min(1, twinkle + (s.bright ? 0.25 : 0))})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (visible && !(reduce && warpT === 0 && ripples.current.length === 0 && e === 0)) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
      }
    };

    const start = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    resize();
    start();

    const ro = new ResizeObserver(() => {
      resize();
      start();
    });
    ro.observe(canvas);

    const themeObs = new MutationObserver(() => {
      colors = readColors();
      start();
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && !document.hidden;
      if (visible) start();
    });
    io.observe(canvas);

    const onVis = () => {
      visible = !document.hidden;
      if (visible) start();
    };
    document.addEventListener("visibilitychange", onVis);

    const onMove = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ev.clientX - rect.left;
      mouse.y = ev.clientY - rect.top;
      mouse.active = mouse.y >= 0 && mouse.y <= rect.height;
      start();
    };
    const onLeave = () => {
      mouse.active = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    // keep animating while props change (typing, warp)
    const kick = setInterval(start, 250);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(kick);
      ro.disconnect();
      io.disconnect();
      themeObs.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [density]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
