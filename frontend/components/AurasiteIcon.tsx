import { useEffect, useRef } from 'react';

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

function createParticles(cx: number, cy: number): Particle[] {
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
      color: '#00f3ff',
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
        this.color = Math.random() > 0.4 ? '#00f3ff' : '#00ffaa';
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const scale = size / CANVAS_SIZE;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    let time = 0;
    let frameId = 0;

    const circuits = createCircuits();
    const particles = createParticles(cx, cy);

    function renderFrame() {
      time += 0.03;

      const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, CANVAS_SIZE * 0.72);
      bgGrad.addColorStop(0, '#0d1330');
      bgGrad.addColorStop(0.5, '#070814');
      bgGrad.addColorStop(1, '#11051c');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      ctx.lineWidth = 1.5;
      circuits.forEach((circuit) => {
        const pulseAlpha = circuit.alpha * (1 + 0.4 * Math.sin(time * 2 + circuit.phase));
        ctx.strokeStyle = `rgba(0, 180, 255, ${pulseAlpha})`;
        ctx.beginPath();
        ctx.moveTo(circuit.points[0].x, circuit.points[0].y);
        for (let i = 1; i < circuit.points.length; i++) {
          ctx.lineTo(circuit.points[i].x, circuit.points[i].y);
        }
        ctx.stroke();
      });

      ctx.globalCompositeOperation = 'screen';
      particles.forEach((particle) => {
        particle.update();
        particle.draw(ctx);
      });

      const grad = ctx.createLinearGradient(cx - 130, cy - 130, cx + 130, cy + 130);
      grad.addColorStop(0, '#00ffaa');
      grad.addColorStop(0.4, '#00f3ff');
      grad.addColorStop(1, '#0044ff');

      const passes = [
        { blur: 45, opacity: 0.25, width: 14 },
        { blur: 20, opacity: 0.45, width: 8 },
        { blur: 8, opacity: 0.75, width: 4 },
        { blur: 2, opacity: 1.0, width: 2 },
      ];
      const pulseIntensity = 1 + 0.05 * Math.sin(time * 2.5);

      passes.forEach((pass) => {
        ctx.save();
        ctx.strokeStyle = grad;
        ctx.globalAlpha = pass.opacity;
        ctx.shadowColor = '#00f3ff';
        ctx.shadowBlur = pass.blur * pulseIntensity;
        ctx.lineWidth = (pass.width + 2) * 1.1;
        ctx.beginPath();
        ctx.arc(cx, cy, 125, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = pass.width * 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, 112, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = pass.width * 1.3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawA(ctx, cx, cy, pulseIntensity);
        ctx.restore();
      });

      ctx.globalCompositeOperation = 'source-over';
      frameId = window.requestAnimationFrame(renderFrame);
    }

    frameId = window.requestAnimationFrame(renderFrame);

    return () => window.cancelAnimationFrame(frameId);
  }, [size]);

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
