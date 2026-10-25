"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FIREWORK_HUES = [28, 45, 52, 188, 204, 276, 326, 350];
const CANDLES = [
  [-46, -17],
  [0, -25],
  [46, -17],
  [-25, 22],
  [25, 22],
];

type MicState = "idle" | "requesting" | "calibrating" | "listening" | "denied" | "unsupported";

type Particle = {
  x: number;
  y: number;
  z: number;
  hue: number;
  light: number;
  alpha: number;
  size: number;
  phase: number;
};

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 1831565813;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildParticles() {
  const random = mulberry32(20260824);
  const points: Particle[] = [];

  const push = (
    x: number,
    y: number,
    z: number,
    hue = 196,
    light = 72,
    alpha = 0.82,
    size = 1.4,
  ) => {
    points.push({ x, y, z, hue, light, alpha, size, phase: random() * Math.PI * 2 });
  };

  const tier = (radius: number, top: number, bottom: number, count: number, hue: number) => {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const y = top + random() * (bottom - top);
      const wobble = 1 + (random() - 0.5) * 0.025;
      push(
        Math.cos(angle) * radius * wobble,
        y,
        Math.sin(angle) * radius * wobble,
        hue + (random() - 0.5) * 16,
        62 + random() * 25,
        0.5 + random() * 0.48,
        0.8 + random() * 1.35,
      );
    }

    for (let i = 0; i < count * 0.7; i += 1) {
      const angle = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * radius;
      push(
        Math.cos(angle) * r,
        bottom + (random() - 0.5) * 1.5,
        Math.sin(angle) * r,
        hue + (random() - 0.5) * 12,
        70 + random() * 24,
        0.58 + random() * 0.4,
        0.9 + random() * 1.45,
      );
    }

    for (let i = 0; i < 220; i += 1) {
      const angle = (i / 220) * Math.PI * 2;
      push(Math.cos(angle) * radius, bottom, Math.sin(angle) * radius, 191, 91, 0.96, 1.65);
      if (i % 4 === 0) {
        push(Math.cos(angle) * radius, top, Math.sin(angle) * radius, 205, 78, 0.75, 1.2);
      }
    }

    for (let i = 0; i < 14; i += 1) {
      const angle = (i / 14) * Math.PI * 2 + random() * 0.14;
      const height = 7 + random() * 14;
      for (let y = 0; y < height; y += 2.3) {
        push(Math.cos(angle) * (radius + 1), bottom - y, Math.sin(angle) * (radius + 1), 188, 94, 0.92, 1.45);
      }
    }
  };

  tier(146, -128, -55, 760, 199);
  tier(108, -55, 5, 600, 194);
  tier(76, 5, 56, 470, 202);

  for (let i = 0; i < 380; i += 1) {
    const angle = random() * Math.PI * 2;
    const r = 154 + random() * 22;
    push(Math.cos(angle) * r, -133 + (random() - 0.5) * 2, Math.sin(angle) * r, 192, 78 + random() * 18, 0.7, 1.25);
  }

  CANDLES.forEach(([x, z], index) => {
    for (let i = 0; i < 115; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 4.2 + random() * 1.2;
      const y = 58 + random() * 49;
      const lit = Math.sin(y * 0.34 + index) > 0;
      push(
        x + Math.cos(angle) * radius,
        y,
        z + Math.sin(angle) * radius,
        lit ? 191 : 34,
        lit ? 88 : 67,
        0.92,
        1.25,
      );
    }
  });

  return points;
}

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY?: number;
  hue: number;
  alpha: number;
  decay: number;
  size: number;
  rocket: boolean;
  trail: [number, number][];
};

export default function Home() {
  const cakeRef = useRef<HTMLCanvasElement>(null);
  const fireworksRef = useRef<HTMLCanvasElement>(null);
  const rotation = useRef({ x: -0.12, y: -0.35 });
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const candlesLit = useRef(true);
  const celebrated = useRef(false);
  const blowAt = useRef(0);
  const burst = useRef<() => void>(() => undefined);
  const extinguish = useRef<() => void>(() => undefined);
  const micStream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const micFrame = useRef(0);

  const [celebrating, setCelebrating] = useState(false);
  const [micState, setMicState] = useState<MicState>("idle");
  const [level, setLevel] = useState(0);

  const releaseMic = useCallback(() => {
    window.cancelAnimationFrame(micFrame.current);
    micStream.current?.getTracks().forEach((track) => track.stop());
    micStream.current = null;
    if (audioContext.current && audioContext.current.state !== "closed") {
      audioContext.current.close();
    }
    audioContext.current = null;
  }, []);

  const playChime = useCallback(() => {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [392, 523.25, 659.25, 783.99, 659.25, 880];
    const start = ctx.currentTime + 0.03;
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = index % 2 ? "sine" : "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + index * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.09, start + index * 0.13 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.13 + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start + index * 0.13);
      osc.stop(start + index * 0.13 + 0.45);
    });
    window.setTimeout(() => void ctx.close(), 1800);
  }, []);

  const blowOut = useCallback(() => {
    if (celebrated.current) return;
    celebrated.current = true;
    candlesLit.current = false;
    blowAt.current = performance.now();
    setCelebrating(true);
    setMicState("idle");
    setLevel(0);
    releaseMic();
    playChime();
    burst.current();
  }, [playChime, releaseMic]);

  extinguish.current = blowOut;

  const relight = useCallback(() => {
    releaseMic();
    celebrated.current = false;
    candlesLit.current = true;
    blowAt.current = 0;
    setCelebrating(false);
    setMicState("idle");
    setLevel(0);
  }, [releaseMic]);

  const startBreathDetection = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState("unsupported");
      return;
    }
    releaseMic();
    setMicState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false },
      });
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) {
        stream.getTracks().forEach((track) => track.stop());
        setMicState("unsupported");
        return;
      }
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);
      micStream.current = stream;
      audioContext.current = ctx;
      setMicState("calibrating");

      const buffer = new Uint8Array(analyser.fftSize);
      const samples: number[] = [];
      const startedAt = performance.now();
      let threshold = 0.075;
      let streak = 0;
      let calibrated = false;

      const tick = () => {
        analyser.getByteTimeDomainData(buffer);
        let energy = 0;
        let crossings = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const v = (buffer[i] - 128) / 128;
          energy += v * v;
          if (i > 0 && (buffer[i] - 128) * (buffer[i - 1] - 128) < 0) crossings += 1;
        }
        const rms = Math.sqrt(energy / buffer.length);
        const elapsed = performance.now() - startedAt;

        if (elapsed < 850) {
          samples.push(rms);
          setLevel(Math.min(0.35, elapsed / 2400));
        } else {
          if (!calibrated) {
            const noise = samples.reduce((sum, v) => sum + v, 0) / Math.max(1, samples.length);
            threshold = Math.max(0.055, noise * 3.4);
            calibrated = true;
            setMicState("listening");
          }
          const turbulent = crossings > 80;
          const ratio = rms / threshold;
          setLevel(Math.min(1, ratio));
          if (rms > threshold && turbulent) streak += 1;
          else streak = Math.max(0, streak - 2);
          if (streak >= 6) {
            extinguish.current();
            return;
          }
        }
        micFrame.current = window.requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setMicState("denied");
      releaseMic();
    }
  }, [releaseMic]);

  useEffect(() => () => releaseMic(), [releaseMic]);

  useEffect(() => {
    const canvas = cakeRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const points = buildParticles();
    let width = 680;
    let height = 470;
    let dpr = 1;
    let frame = 0;
    let last = performance.now();
    let paused = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const project = (x: number, y: number, z: number) => {
      const cosY = Math.cos(rotation.current.y);
      const sinY = Math.sin(rotation.current.y);
      const cosX = Math.cos(rotation.current.x);
      const sinX = Math.sin(rotation.current.x);
      const dx = x * cosY - z * sinY;
      const dz = x * sinY + z * cosY;
      const dy = y * cosX - dz * sinX;
      const depth = y * sinX + dz * cosX;
      const perspective = 520 / (520 + depth);
      const fit = Math.min(width / 430, height / 370);
      return {
        x: width / 2 + dx * perspective * fit,
        y: height * 0.58 - dy * perspective * fit,
        z: depth,
        scale: perspective * fit,
      };
    };

    const draw = (time: number) => {
      const delta = Math.min(32, time - last);
      last = time;
      if (!paused && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        rotation.current.y += delta * 0.00017;
      }

      ctx.clearRect(0, 0, width, height);
      const projected = points
        .map((point) => ({ point, position: project(point.x, point.y, point.z) }))
        .sort((a, b) => b.position.z - a.position.z);

      ctx.globalCompositeOperation = "lighter";

      projected.forEach(({ point, position }, index) => {
        const twinkle = 0.72 + Math.sin(time * 0.0025 + point.phase) * 0.28;
        const alpha = point.alpha * twinkle;
        const radius = Math.max(0.55, point.size * position.scale * 0.58);
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${point.hue}, 100%, ${point.light}%, ${alpha})`;
        if (index % 29 === 0) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = `hsla(${point.hue}, 100%, 74%, .8)`;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      CANDLES.forEach(([x, z], index) => {
        const base = project(x, 110, z);
        if (candlesLit.current) {
          const flicker = Math.sin(time * 0.011 + index * 1.7);
          const glow = ctx.createRadialGradient(base.x, base.y - 8, 0, base.x, base.y - 8, 31 * base.scale);
          glow.addColorStop(0, "rgba(255, 244, 151, .42)");
          glow.addColorStop(0.35, "rgba(255, 155, 40, .18)");
          glow.addColorStop(1, "rgba(255, 104, 22, 0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(base.x, base.y - 8, 31 * base.scale, 0, Math.PI * 2);
          ctx.fill();

          for (let i = 0; i < 23; i += 1) {
            const t = i / 22;
            const spread = (1 - t) * 6.5 * base.scale;
            const sway = Math.sin(time * 0.014 + i * 2.4 + index) * spread * 0.5;
            const fx = base.x + sway + Math.sin(i * 8.3) * spread;
            const fy = base.y - 5 - t * (25 + flicker * 3) * base.scale;
            ctx.beginPath();
            ctx.arc(fx, fy, Math.max(0.8, (2.3 - t) * base.scale), 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${42 - t * 22}, 100%, ${62 + t * 30}%, ${0.68 + t * 0.3})`;
            ctx.fill();
          }
        } else if (blowAt.current) {
          const t = (time - blowAt.current) / 5200;
          if (t < 1) {
            ctx.globalCompositeOperation = "source-over";
            ctx.beginPath();
            ctx.moveTo(base.x, base.y - 5);
            ctx.bezierCurveTo(
              base.x + Math.sin(time * 0.002 + index) * 9,
              base.y - 28,
              base.x - 12,
              base.y - 46,
              base.x + Math.sin(time * 0.0015 + index) * 16,
              base.y - 70,
            );
            ctx.strokeStyle = `rgba(178, 202, 211, ${0.34 * (1 - t)})`;
            ctx.lineWidth = Math.max(1, 2.2 * base.scale);
            ctx.stroke();
            ctx.globalCompositeOperation = "lighter";
          }
        }
      });

      frame = window.requestAnimationFrame(draw);
    };

    const onPointerDown = (event: PointerEvent) => {
      paused = true;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-dragging");
    };

    const onPointerMove = (event: PointerEvent) => {
      const state = drag.current;
      if (!state || state.id !== event.pointerId) return;
      rotation.current.y += (event.clientX - state.x) * 0.009;
      rotation.current.x = Math.max(-0.48, Math.min(0.34, rotation.current.x + (event.clientY - state.y) * 0.006));
      state.x = event.clientX;
      state.y = event.clientY;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (drag.current?.id !== event.pointerId) return;
      paused = false;
      drag.current = null;
      canvas.classList.remove("is-dragging");
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };

    window.addEventListener("resize", resize);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    resize();
    frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  useEffect(() => {
    const canvas = fireworksRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sparks: Spark[] = [];
    const timers: number[] = [];
    let width = window.innerWidth;
    let height = window.innerHeight;
    let frame = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const launch = (targetX: number, targetY: number, hue: number) => {
      const startX = width * (0.18 + Math.random() * 0.64);
      const flight = 52 + Math.random() * 18;
      sparks.push({
        x: startX,
        y: height + 15,
        vx: (targetX - startX) / flight,
        vy: (targetY - height) / flight,
        targetY,
        hue,
        alpha: 1,
        decay: 0,
        size: 2.2,
        rocket: true,
        trail: [],
      });
    };

    const explode = (x: number, y: number, hue: number) => {
      const count = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 34 : 92;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.08;
        const speed = 1.7 + Math.random() * 5;
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          hue: hue + (Math.random() - 0.5) * 20,
          alpha: 1,
          decay: 0.009 + Math.random() * 0.01,
          size: 1 + Math.random() * 2,
          rocket: false,
          trail: [],
        });
      }
    };

    burst.current = () => {
      (
        [
          [0.12, 0.24],
          [0.35, 0.17],
          [0.64, 0.19],
          [0.87, 0.27],
          [0.22, 0.44],
          [0.5, 0.34],
          [0.78, 0.43],
          [0.08, 0.6],
          [0.92, 0.58],
        ] as const
      ).forEach(([fx, fy], index) => {
        timers.push(
          window.setTimeout(() => {
            launch(width * fx, height * fy, FIREWORK_HUES[index % FIREWORK_HUES.length]);
          }, index * 210),
        );
      });
    };

    const strokeTrail = (spark: Spark) => {
      if (spark.trail.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(spark.trail[0][0], spark.trail[0][1]);
      spark.trail.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.strokeStyle = `hsla(${spark.hue}, 100%, 72%, ${spark.alpha * 0.28})`;
      ctx.lineWidth = spark.size * 0.7;
      ctx.stroke();
    };

    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.trail.push([spark.x, spark.y]);
        if (spark.trail.length > (spark.rocket ? 10 : 6)) spark.trail.shift();

        spark.x += spark.vx;
        spark.y += spark.vy;
        strokeTrail(spark);

        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${spark.hue}, 100%, 72%, ${spark.alpha})`;
        ctx.shadowBlur = spark.rocket ? 17 : 9;
        ctx.shadowColor = `hsl(${spark.hue}, 100%, 68%)`;
        ctx.fill();
        ctx.shadowBlur = 0;

        if (spark.rocket) {
          spark.vy += 0.012;
          if (spark.y <= (spark.targetY ?? height * 0.3)) {
            explode(spark.x, spark.y, spark.hue);
            sparks.splice(i, 1);
          }
        } else {
          spark.vx *= 0.988;
          spark.vy = spark.vy * 0.988 + 0.04;
          spark.alpha -= spark.decay;
          if (spark.alpha <= 0) sparks.splice(i, 1);
        }
      }

      frame = window.requestAnimationFrame(tick);
    };

    window.addEventListener("resize", resize);
    resize();
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("resize", resize);
      burst.current = () => undefined;
    };
  }, []);

  const STATUS_TEXT: Record<MicState, string> = {
    idle: "点亮蜡烛 · 等你许愿",
    requesting: "正在请求麦克风权限…",
    calibrating: "正在听一听周围的声音…",
    listening: "现在，对着麦克风轻轻吹气",
    denied: "没有获得麦克风权限，可以点击吹灭",
    unsupported: "当前浏览器不支持吹气识别，可以点击吹灭",
  };
  const statusText = STATUS_TEXT[micState];

  return (
    <main className={`birthday-experience ${celebrating ? "is-celebrated" : ""}`}>
      <canvas ref={fireworksRef} className="fireworks-layer" aria-hidden="true" />
      <div className="star-noise" aria-hidden="true" />
      <div className="blue-halo" aria-hidden="true" />

      <header className="site-header">
        <div className="tiny-mark">
          <i /> 星禾AI共创社区
        </div>
        <div className="edition">AUG · 2026</div>
      </header>

      <section className="birthday-hero" aria-live="polite">
        <div className="title-lockup">
          <p className="micro-kicker">A SMALL UNIVERSE MADE FOR YOU</p>
          <h1>
            <span>{celebrating ? "Wish Came" : "Happy"}</span>
            <span>{celebrating ? "True!" : "Birthday!"}</span>
          </h1>
          <p className="for-name">
            FOR <strong>令旺</strong>
          </p>
        </div>

        <div className="cake-stage">
          <div className="cake-orbit cake-orbit-one" aria-hidden="true" />
          <div className="cake-orbit cake-orbit-two" aria-hidden="true" />
          <canvas
            ref={cakeRef}
            className="cake-canvas"
            role="img"
            aria-label="可以拖动旋转的冰蓝色三维粒子蛋糕，顶部点亮了五支蜡烛"
          />
          <div className="rotation-hint">
            <span>↔</span> 拖动蛋糕 · 360° 旋转
          </div>
        </div>

        <div className="wish-panel">
          {celebrating ? (
            <div className="celebration-message">
              <p>HAPPY BIRTHDAY, 令旺</p>
              <h2>
                愿你的每一岁，
                <br />
                都奔走在热爱里。
              </h2>
              <button type="button" className="primary-action" onClick={relight}>
                重新点亮蜡烛
              </button>
            </div>
          ) : (
            <>
              <p className="wish-line">闭上眼睛，许一个愿。</p>
              <div className="mic-status" data-state={micState}>
                <span className="status-dot" />
                <span>{statusText}</span>
                {(micState === "listening" || micState === "calibrating") && (
                  <span className="level-track" aria-hidden="true">
                    <i style={{ transform: `scaleX(${Math.max(0.04, level)})` }} />
                  </span>
                )}
              </div>
              <div className="action-row">
                <button
                  type="button"
                  className="primary-action"
                  onClick={startBreathDetection}
                  disabled={micState === "requesting" || micState === "calibrating" || micState === "listening"}
                >
                  <span className="mic-icon" aria-hidden="true" />
                  {micState === "listening" ? "正在听你吹气" : "开启吹气感应"}
                </button>
                <button type="button" className="text-action" onClick={blowOut}>
                  直接吹灭
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <footer className="site-footer">
        <span>MADE OF 4,000+ LIGHT PARTICLES</span>
        <span>轻轻吹气，点亮属于令旺的夜空</span>
      </footer>
    </main>
  );
}
