"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number;
}

interface Projected {
  x: number; y: number; z: number;
  px: number; py: number;
}

const PARTICLE_COUNT = 80;
const SPHERE_RADIUS = 100;
const MOUSE_INFLUENCE = 200;
const CONNECTION_DIST = 55;
const GRID_CELL = CONNECTION_DIST * 1.2;

export default function ParticleSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let mouseX = width / 2;
    let mouseY = height / 2;
    let particles: Particle[] = [];
    let lastTime = 0;
    const animFrameRef = { current: 0 };
    const LINE_COLOR = "rgba(129,140,248,0.15)";
    const NODE_COLOR_MAX = "rgba(167,139,250,0.8)";
    const NODE_COLOR_MIN = "rgba(167,139,250,0.2)";

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width;
      canvas!.height = height;
    }

    function initParticles() {
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const phi = Math.acos(2 * Math.random() - 1);
        const theta = 2 * Math.PI * Math.random();
        const r = SPHERE_RADIUS * (0.7 + Math.random() * 0.5);
        particles.push({
          x: Math.cos(theta) * Math.sin(phi) * r,
          y: Math.sin(theta) * Math.sin(phi) * r,
          z: Math.cos(phi) * r,
          vx: 0, vy: 0,
        });
      }
    }

    // 空间哈希网格：将粒子按屏幕坐标分桶，只检查相邻格子
    function buildGrid(proj: Projected[]) {
      const grid = new Map<number, number[]>();
      for (let i = 0; i < proj.length; i++) {
        const gx = Math.floor(proj[i].px / GRID_CELL);
        const gy = Math.floor(proj[i].py / GRID_CELL);
        const key = gx * 10000 + gy;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(i);
      }
      return grid;
    }

    function animate(timestamp: number) {
      // 30fps 节流
      if (timestamp - lastTime < 33) {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      lastTime = timestamp;

      ctx!.clearRect(0, 0, width, height);

      const cx = mouseX;
      const cy = mouseY;
      const rotSpeed = 0.002;

      // 旋转 + 鼠标力 + 约束
      for (const p of particles) {
        const nx = p.x * Math.cos(rotSpeed) - p.z * Math.sin(rotSpeed);
        const nz = p.x * Math.sin(rotSpeed) + p.z * Math.cos(rotSpeed);
        const ny = p.y * Math.cos(rotSpeed * 0.6) - nz * Math.sin(rotSpeed * 0.6);
        const nz2 = p.y * Math.sin(rotSpeed * 0.6) + nz * Math.cos(rotSpeed * 0.6);
        p.x = nx; p.y = ny; p.z = nz2;

        const dx = p.x - (cx - width / 2);
        const dy = p.y - (cy - height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy + p.z * p.z);
        if (dist < MOUSE_INFLUENCE && dist > 0) {
          const force = (MOUSE_INFLUENCE - dist) / MOUSE_INFLUENCE;
          p.vx += (dx / dist) * force * 0.08;
          p.vy += (dy / dist) * force * 0.08;
        }

        p.vx *= 0.94;
        p.vy *= 0.94;
        p.x += p.vx;
        p.y += p.vy;

        const len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
        if (len > 0) {
          const tl = SPHERE_RADIUS * (0.7 + Math.random() * 0.002);
          p.x = (p.x / len) * tl;
          p.y = (p.y / len) * tl;
          p.z = (p.z / len) * tl;
        }
      }

      // 投影
      const projected: Projected[] = [];
      for (const p of particles) {
        const scale = 400 / (400 + p.z);
        projected.push({
          x: p.x, y: p.y, z: p.z,
          px: p.x * scale + width / 2,
          py: p.y * scale + height / 2,
        });
      }

      // 网格加速连线绘制
      const grid = buildGrid(projected);
      const drawn = new Set<string>();

      ctx!.strokeStyle = LINE_COLOR;
      ctx!.lineWidth = 0.5;
      ctx!.beginPath();

      for (const [key, indices] of grid) {
        const gx = Math.floor(Number(key) / 10000);
        const gy = Number(key) % 10000;

        for (let dx = 0; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy < 0) continue;
            const nk = (gx + dx) * 10000 + (gy + dy);
            const neighbors = grid.get(nk);
            if (!neighbors) continue;

            for (const i of indices) {
              for (const j of neighbors) {
                if (i >= j) continue;
                const k = `${Math.min(i, j)}_${Math.max(i, j)}`;
                if (drawn.has(k)) continue;
                drawn.add(k);

                const a = projected[i];
                const b = projected[j];
                const ddx = a.x - b.x;
                const ddy = a.y - b.y;
                const ddz = a.z - b.z;
                const dist = ddx * ddx + ddy * ddy + ddz * ddz;
                if (dist < CONNECTION_DIST * CONNECTION_DIST) {
                  ctx!.moveTo(a.px, a.py);
                  ctx!.lineTo(b.px, b.py);
                }
              }
            }
          }
        }
      }
      ctx!.stroke();

      // 绘制节点（批量 fill）
      for (const p of projected) {
        const alpha = 0.25 + (p.z / (SPHERE_RADIUS * 1.5) + 0.5) * 0.7;
        ctx!.beginPath();
        ctx!.arc(p.px, p.py, 1.0, 0, Math.PI * 2);
        ctx!.fillStyle = alpha > 0.5 ? NODE_COLOR_MAX : NODE_COLOR_MIN;
        ctx!.fill();
      }

      animFrameRef.current = requestAnimationFrame(animate);
    }

    function handleMouseMove(e: MouseEvent) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }

    resize();
    initParticles();
    animFrameRef.current = requestAnimationFrame(animate);

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-canvas" />;
}