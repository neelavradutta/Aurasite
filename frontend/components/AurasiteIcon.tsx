import { useEffect, useRef } from 'react';
import { useThemeStore } from '@/store/themeStore';
import { BROWN_CREAM, isCreamTheme } from '@/theme/themeColors';

const CANVAS_SIZE = 512;

type Circuit = {
  points: Array<{ x: number; y: number }>;
  alpha: number;
  phase: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  color: string;
  reset: (cx: number, cy: number) => void;
  update: () => void;
  draw: (ctx: CanvasRenderingContext2D) => void;
};

function createCircuits(): Circuit[] {
  const circuits: Circuit[] = [];
  for (let i = 0; i < 18; i++) {
    let x = Math.random() * CANVAS_SIZE;
    let y = Math.random() * CANVAS_SIZE;
    const points = [{ x, y }];
    const segments = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < segments; j++) {
      const horizontal = Math.random() > 0.5;
      const length = (Math.random() - 0.5) * 120;
      if (horizontal) x += length;
      else y += length;
      points.push({ x, y });
    }
    circuits.push({
      points,
      alpha: 0.03 + Math.random() * 0.08,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return circuits;
}

function createParticles(cx: number, cy: number, particleA: string, particleB: string): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < 50; i++) {
    const particle = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 1,
      alpha: 1,
      life: 0.01,
      color: particleA,
      reset(cxVal: number, cyVal: number) {
        const angle = Math.random() * Math.PI * 2;
        const r = 100 + Math.random() * 40;
        this.x = cxVal + Math.cos(angle) * r;
        this.y = cyVal + Math.sin(angle) * r;
        this.vx = Math.cos(angle) * (0.8 + Math.random() * 2.2);
        this.vy = Math.sin(angle) * (0.8 + Math.random() * 2.2) - 0.15;
        this.size = 2.5 + Math.random() * 4.5;
        this.alpha = 1;
        this.life = 0.006 + Math.random() * 0.012;
        this.color = Math.random() > 0.4 ? particleA : particleB;
      },
      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.life;
        if (this.alpha <= 0) this.reset(cx, cy);
      },
      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.shadowBlur = 18;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
    };
    particle.reset(cx, cy);
    particles.push(particle);
  }
  return particles;
}

function drawA(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number
): void {
  ctx.beginPath();
  ctx.moveTo(cx - 50 * scale, cy + 60 * scale);
  ctx.bezierCurveTo(cx - 90 * scale, cy + 20 * scale, cx - 40 * scale, cy - 80 * scale, cx, cy - 75 * scale);
  ctx.bezierCurveTo(cx + 30 * scale, cy - 70 * scale, cx + 55 * scale, cy + 20 * scale, cx + 30 * scale, cy + 65 * scale);
  ctx.moveTo(cx - 40 * scale, cy + 15 * scale);
  ctx.quadraticCurveTo(cx + 10 * scale, cy - 10 * scale, cx + 45 * scale, cy - 35 * scale);
  ctx.moveTo(cx - 20 * scale, cy + 30 * scale);
  ctx.quadraticCurveTo(cx + 20 * scale, cy + 5 * scale, cx + 35 * scale, cy - 10 * scale);
  ctx.stroke();
}

interface Props {
  size?: number;
  className?: string;
}

export default function AurasiteIcon({ size = 44, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useThemeStore((state) => state.theme);
  const cream = isCreamTheme(theme);
  const palette = cream
    ? BROWN_CREAM
    : {
        iconBgInner: '#0d1330',
        iconBgMid: '#070814',
        iconBgOuter: '#11051c',
        iconCircuit: 'rgba(0, 180, 255',
        iconParticleA: '#00f3ff',
        iconParticleB: '#00ffaa',
        iconRingStart: '#00ffaa',
        iconRingMid: '#00f3ff',
        iconRingEnd: '#0044ff',
        iconShadow: '#00f3ff',
      };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = Math.max(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const scale = size / CANVAS_SIZE;
    context.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    let time = 0;
    let frameId = 0;

    const circuits = createCircuits();
    const particles = createParticles(cx, cy, palette.iconParticleA, palette.iconParticleB);

    function renderFrame() {
      if (!context) return;

      time += 0.03;

      const bgGrad = context.createRadialGradient(cx, cy, 10, cx, cy, CANVAS_SIZE * 0.72);
      bgGrad.addColorStop(0, palette.iconBgInner);
      bgGrad.addColorStop(0.5, palette.iconBgMid);
      bgGrad.addColorStop(1, palette.iconBgOuter);
      context.fillStyle = bgGrad;
      context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      context.lineWidth = 1.5;
      circuits.forEach((circuit) => {
        const baseAlpha = cream ? circuit.alpha * 2.5 : circuit.alpha;
        const pulseAlpha = baseAlpha * (1 + 0.4 * Math.sin(time * 2 + circuit.phase));
        context.strokeStyle = cream
          ? `rgba(74, 43, 18, ${Math.min(pulseAlpha, 0.45)})`
          : `rgba(0, 180, 255, ${pulseAlpha})`;
        context.beginPath();
        context.moveTo(circuit.points[0].x, circuit.points[0].y);
        for (let i = 1; i < circuit.points.length; i++) {
          context.lineTo(circuit.points[i].x, circuit.points[i].y);
        }
        context.stroke();
      });

      context.globalCompositeOperation = cream ? 'source-over' : 'screen';
      particles.forEach((particle) => {
        particle.update();
        particle.draw(context);
      });
      context.globalCompositeOperation = 'source-over';

      const grad = context.createLinearGradient(cx - 130, cy - 130, cx + 130, cy + 130);
      grad.addColorStop(0, palette.iconRingStart);
      grad.addColorStop(0.4, palette.iconRingMid);
      grad.addColorStop(1, palette.iconRingEnd);

      const passes = cream
        ? [
            { blur: 8, opacity: 0.35, width: 8 },
            { blur: 0, opacity: 1, width: 3.5 },
          ]
        : [
            { blur: 45, opacity: 0.25, width: 14 },
            { blur: 20, opacity: 0.45, width: 8 },
            { blur: 8, opacity: 0.75, width: 4 },
            { blur: 2, opacity: 1.0, width: 2 },
          ];
      const pulseIntensity = 1 + 0.05 * Math.sin(time * 2.5);

      passes.forEach((pass) => {
        context.save();
        context.strokeStyle = grad;
        context.globalAlpha = pass.opacity;
        context.shadowColor = cream ? 'transparent' : palette.iconShadow;
        context.shadowBlur = cream ? 0 : pass.blur * pulseIntensity;
        context.lineWidth = (pass.width + 2) * 1.1;
        context.beginPath();
        context.arc(cx, cy, 125, 0, Math.PI * 2);
        context.stroke();
        context.lineWidth = pass.width * 0.6;
        context.beginPath();
        context.arc(cx, cy, 112, 0, Math.PI * 2);
        context.stroke();
        context.lineWidth = pass.width * 1.3;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        drawA(context, cx, cy, pulseIntensity);
        context.restore();
      });

      context.globalCompositeOperation = 'source-over';
      frameId = window.requestAnimationFrame(renderFrame);
    }

    frameId = window.requestAnimationFrame(renderFrame);

    return () => window.cancelAnimationFrame(frameId);
  }, [size, theme]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-hidden
      className={`block shrink-0 rounded-lg ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  );
}
