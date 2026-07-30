import { VisualizerRenderer, RenderParams } from './types';

/**
 * Galaxy Field Visualizer
 * 180 particles orbit around center in an elliptical pattern
 * Low energy = slow drift, high energy = explosion outward
 * Star-trail persistence creates flowing motion
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseSpeed: number;
  angle: number;
  orbitR: number;
  size: number;
  hue: number;
  alpha: number;
}

let particles: Particle[] = [];

const PARTICLE_COUNT = 180;

export const galaxyFieldRenderer: VisualizerRenderer = {
  name: 'Galaxy Field',

  init() {
    // Initialize particles in random positions with orbital properties
    particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: 0,
      vy: 0,
      baseSpeed: 0.0002 + Math.random() * 0.0004,
      angle: Math.random() * Math.PI * 2,
      orbitR: 0.05 + Math.random() * 0.42,
      size: 0.8 + Math.random() * 2.2,
      hue: 180 + Math.random() * 100,  // cyan to purple range
      alpha: 0.3 + Math.random() * 0.7,
    }));
  },

  render(ctx: CanvasRenderingContext2D, params: RenderParams) {
    const { width, height, energy } = params;
    const cx = width / 2;
    const cy = height / 2;

    // Semi-transparent clear — star trail effect
    ctx.fillStyle = 'rgba(7,8,12,0.18)';
    ctx.fillRect(0, 0, width, height);

    // Combined energy drives explosion radius
    const totalEnergy = energy.low * 0.5 + energy.mid * 0.3 + energy.high * 0.2;
    // At rest: slow circular orbits. High energy: particles fling outward
    const speedMult = 1 + totalEnergy * 12;
    const explosionRadius = totalEnergy * Math.min(width, height) * 0.25;

    for (const p of particles) {
      // Advance orbital angle
      p.angle += p.baseSpeed * speedMult;

      // Current position: orbit around center + energy explosion offset
      const orbitX = cx + Math.cos(p.angle) * (p.orbitR * Math.min(width, height) * 0.45);
      const orbitY = cy + Math.sin(p.angle) * (p.orbitR * Math.min(height, width) * 0.25);

      // Explode outward on energy burst
      const explodeDir = p.angle;
      const ex = orbitX + Math.cos(explodeDir) * explosionRadius * p.orbitR;
      const ey = orbitY + Math.sin(explodeDir) * explosionRadius * p.orbitR;

      // Draw particle with dynamic sizing and glow
      const brightness = 50 + totalEnergy * 50;
      const sat = 60 + energy.air * 40;
      ctx.shadowBlur = totalEnergy > 0.3 ? 6 + totalEnergy * 12 : 0;
      ctx.shadowColor = `hsl(${p.hue}, ${sat}%, ${brightness}%)`;
      ctx.fillStyle = `hsla(${p.hue}, ${sat}%, ${brightness}%, ${p.alpha})`;

      const drawSize = p.size * (1 + totalEnergy * 2);
      ctx.beginPath();
      ctx.arc(ex, ey, drawSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Reset shadow
    ctx.shadowBlur = 0;
  },
};
