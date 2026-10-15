"use client";

import { useEffect, useRef } from "react";

export type CoreState = "idle" | "listening" | "thinking" | "executing" | "speaking";

export const CORE_STATE_LABELS: Record<CoreState, string> = {
  idle: "En attente",
  listening: "Écoute",
  thinking: "Réflexion",
  executing: "Exécution",
  speaking: "Parole",
};

interface Params {
  rot: number; // ring rotation speed (rad/s)
  glow: number; // overall intensity
  pulseAmp: number; // core breathing amplitude
  pulseHz: number;
  spread: number; // ring radius multiplier
  wave: number; // waveform ring strength (listening)
  chase: number; // chasing arcs (thinking)
  sweep: number; // radar sweep (executing)
  ripple: number; // emanating ripples (speaking)
  white: number; // shift from cyan toward white
}

const TARGETS: Record<CoreState, Params> = {
  idle: { rot: 0.12, glow: 0.6, pulseAmp: 0.035, pulseHz: 0.35, spread: 1, wave: 0, chase: 0.15, sweep: 0, ripple: 0, white: 0 },
  listening: { rot: 0.3, glow: 0.85, pulseAmp: 0.05, pulseHz: 0.9, spread: 1.06, wave: 1, chase: 0.2, sweep: 0, ripple: 0, white: 0.1 },
  thinking: { rot: 1.1, glow: 0.9, pulseAmp: 0.03, pulseHz: 1.6, spread: 0.95, wave: 0, chase: 1, sweep: 0, ripple: 0, white: 0.35 },
  executing: { rot: 0.7, glow: 1, pulseAmp: 0.04, pulseHz: 1.2, spread: 1, wave: 0, chase: 0.5, sweep: 1, ripple: 0, white: 0.25 },
  speaking: { rot: 0.35, glow: 0.95, pulseAmp: 0.09, pulseHz: 2.4, spread: 1.03, wave: 0.35, chase: 0.2, sweep: 0, ripple: 1, white: 0.15 },
};

const KEYS = Object.keys(TARGETS.idle) as (keyof Params)[];

function rgba(white: number, a: number): string {
  // Interpolates between cyan (0, 229, 255) and near-white (220, 250, 255).
  const r = Math.round(0 + 220 * white);
  const g = Math.round(229 + 21 * white);
  return `rgba(${r},${g},255,${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

interface Particle {
  r: number; // radius factor
  a: number; // angle
  s: number; // angular speed factor
  size: number;
  tw: number; // twinkle phase
}

export default function Core({
  state,
  level = 0,
  className,
}: {
  state: CoreState;
  /** Optional external audio level 0..1 (microphone or speech), boosts the animation. */
  level?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<CoreState>(state);
  const levelRef = useRef(level);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motion = reduceMotion ? 0.25 : 1;
    const cur: Params = { ...TARGETS[stateRef.current] };
    const particles: Particle[] = Array.from({ length: 54 }, (_, i) => ({
      r: 0.38 + ((i * 37) % 100) / 100 * 0.62,
      a: (i * 2.399963) % (Math.PI * 2),
      s: 0.25 + ((i * 53) % 100) / 100,
      size: 0.6 + ((i * 29) % 100) / 100 * 1.4,
      tw: i * 1.7,
    }));
    const ripples: { born: number }[] = [];
    let lastRipple = 0;

    let width = 0;
    let height = 0;
    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let running = true;
    let last = performance.now();
    let t = 0;
    const rot = [0, 0, 0, 0, 0];

    const frame = (nowMs: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      t += dt * motion;

      // Smoothly approach the target parameters of the current state.
      const target = TARGETS[stateRef.current];
      const k = 1 - Math.exp(-dt * 4);
      for (const key of KEYS) cur[key] += (target[key] - cur[key]) * k;
      const lvl = Math.max(0, Math.min(1, levelRef.current));

      rot[0] += dt * cur.rot * 0.35 * motion;
      rot[1] -= dt * cur.rot * 0.6 * motion;
      rot[2] += dt * cur.rot * 0.9 * motion;
      rot[3] += dt * cur.rot * 2.2 * motion;
      rot[4] += dt * (0.8 + cur.sweep * 1.6) * motion;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const R = Math.min(width, height) * 0.44;
      const W = cur.white;
      const glow = cur.glow * (1 + lvl * 0.3);
      const pulse =
        1 + cur.pulseAmp * Math.sin(t * Math.PI * 2 * cur.pulseHz) + lvl * 0.12 +
        (cur.ripple > 0.5 ? 0.025 * Math.sin(t * 17) * Math.sin(t * 5.3) : 0);

      ctx.globalCompositeOperation = "lighter";

      // Ambient halo.
      const halo = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.25);
      halo.addColorStop(0, rgba(W, 0.18 * glow));
      halo.addColorStop(0.45, rgba(W, 0.06 * glow));
      halo.addColorStop(1, rgba(W, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);

      // Outer tick ring.
      const tickR = R * 0.98 * cur.spread;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot[0]);
      ctx.lineWidth = 1;
      for (let i = 0; i < 120; i++) {
        const major = i % 10 === 0;
        const a = (i / 120) * Math.PI * 2;
        const len = major ? R * 0.05 : R * 0.022;
        ctx.strokeStyle = rgba(W, (major ? 0.55 : 0.22) * glow);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * tickR, Math.sin(a) * tickR);
        ctx.lineTo(Math.cos(a) * (tickR - len), Math.sin(a) * (tickR - len));
        ctx.stroke();
      }
      ctx.restore();

      // Segmented ring.
      const segR = R * 0.86 * cur.spread;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot[1]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(W, 0.7 * glow);
      ctx.shadowColor = rgba(W, 0.9);
      ctx.shadowBlur = 8 * glow;
      for (let i = 0; i < 3; i++) {
        const start = (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, segR, start, start + Math.PI * 0.52);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(W, 0.18 * glow);
      ctx.beginPath();
      ctx.arc(0, 0, segR + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Dashed ring.
      const dashR = R * 0.74 * cur.spread;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot[2]);
      ctx.setLineDash([2, 7]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(W, 0.45 * glow);
      ctx.beginPath();
      ctx.arc(0, 0, dashR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Chasing arcs (thinking).
      if (cur.chase > 0.02) {
        const chaseR = R * 0.63;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineCap = "round";
        for (let i = 0; i < 4; i++) {
          const phase = rot[3] * (1 + i * 0.35) + i * 1.3;
          const len = 0.35 + 0.25 * Math.sin(t * 2 + i);
          ctx.lineWidth = 2.5 - i * 0.4;
          ctx.strokeStyle = rgba(W + 0.2, (0.75 - i * 0.12) * cur.chase * glow);
          ctx.beginPath();
          ctx.arc(0, 0, chaseR - i * 5, phase, phase + len);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Waveform ring (listening).
      if (cur.wave > 0.02) {
        const baseR = R * 0.5;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(W, 0.8 * cur.wave * glow);
        ctx.beginPath();
        const steps = 160;
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const n =
            Math.sin(a * 6 + t * 3.1) * 0.5 + Math.sin(a * 11 - t * 4.7) * 0.3 + Math.sin(a * 17 + t * 6.3) * 0.2;
          const r = baseR + n * R * 0.045 * cur.wave * (0.6 + lvl * 1.6);
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Radar sweep (executing).
      if (cur.sweep > 0.02) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot[4]);
        const sweepR = R * 0.9;
        const steps = 24;
        for (let i = 0; i < steps; i++) {
          const a0 = -(i / steps) * 0.9;
          ctx.fillStyle = rgba(W, ((1 - i / steps) * 0.16) * cur.sweep);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, sweepR, a0 - 0.9 / steps, a0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = rgba(W + 0.3, 0.8 * cur.sweep);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(sweepR, 0);
        ctx.stroke();
        ctx.restore();
      }

      // Ripples (speaking).
      if (cur.ripple > 0.3 && !reduceMotion && t - lastRipple > 0.55 - lvl * 0.25) {
        ripples.push({ born: t });
        lastRipple = t;
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const age = t - ripples[i].born;
        if (age > 1.6) {
          ripples.splice(i, 1);
          continue;
        }
        const p = age / 1.6;
        ctx.strokeStyle = rgba(W, (1 - p) * 0.5 * cur.ripple);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, R * (0.32 + p * 0.62), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Gyroscope ellipses inside the core.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate(rot[2] * (i % 2 ? -1 : 1) * 0.7 + (i * Math.PI) / 3);
        ctx.strokeStyle = rgba(W, 0.28 * glow);
        ctx.beginPath();
        ctx.ellipse(0, 0, R * 0.4 * pulse, R * 0.4 * pulse * Math.abs(Math.cos(t * 0.4 + i)), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      // Core sphere.
      const coreR = R * 0.3 * pulse;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.6);
      core.addColorStop(0, `rgba(255,255,255,${(0.95 * glow).toFixed(3)})`);
      core.addColorStop(0.18, rgba(W + 0.4, 0.85 * glow));
      core.addColorStop(0.5, rgba(W, 0.35 * glow));
      core.addColorStop(1, rgba(W, 0));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(W, 0.6 * glow);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.stroke();

      // Orbiting particles.
      for (const p of particles) {
        p.a += dt * cur.rot * p.s * 0.8 * motion;
        const r = R * p.r * cur.spread;
        const x = cx + Math.cos(p.a) * r;
        const y = cy + Math.sin(p.a) * r * 0.96;
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + p.tw);
        ctx.fillStyle = rgba(W, (0.25 + 0.55 * tw) * glow);
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={`Noyau JARVIS — état : ${CORE_STATE_LABELS[state]}`}
    />
  );
}
