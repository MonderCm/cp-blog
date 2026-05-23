"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export default function ParticleSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let mouseX = width / 2;
    let mouseY = height / 2;
    let particles: Particle[] = [];
    const PARTICLE_COUNT = 200;
    const SPHERE_RADIUS = 120;
    const MOUSE_INFLUENCE = 250;
    const animFrameRef = { current: 0 };

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
        const r = SPHERE_RADIUS * (0.8 + Math.random() * 0.4);
        particles.push({
          x: Math.cos(theta) * Math.sin(phi) * r,
          y: Math.sin(theta) * Math.sin(phi) * r,
          z: Math.cos(phi) * r,
          vx: 0,
          vy: 0,
          vz: 0,
        });
      }
    }

    function animate() {
      ctx!.clearRect(0, 0, width, height);

      const cx = mouseX;
      const cy = mouseY;

      // Rotate particles slowly
      const rotationSpeed = 0.003;
      for (const p of particles) {
        // Rotate around Y axis
        const nx = p.x * Math.cos(rotationSpeed) - p.z * Math.sin(rotationSpeed);
        const nz = p.x * Math.sin(rotationSpeed) + p.z * Math.cos(rotationSpeed);
        p.x = nx;
        p.z = nz;

        // Rotate around X axis
        const ny = p.y * Math.cos(rotationSpeed * 0.7) - p.z * Math.sin(rotationSpeed * 0.7);
        const nz2 = p.y * Math.sin(rotationSpeed * 0.7) + p.z * Math.cos(rotationSpeed * 0.7);
        p.y = ny;
        p.z = nz2;
      }

      // Draw connections
      const projected: { x: number; y: number; z: number; px: number; py: number }[] = [];

      for (const p of particles) {
        const dx = p.x - (cx - width / 2);
        const dy = p.y - (cy - height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy + p.z * p.z);

        if (dist < MOUSE_INFLUENCE) {
          const force = (MOUSE_INFLUENCE - dist) / MOUSE_INFLUENCE;
          const angle = Math.atan2(dy, dx);
          p.vx += Math.cos(angle) * force * 0.1;
          p.vy += Math.sin(angle) * force * 0.1;
        }

        p.vx *= 0.95;
        p.vy *= 0.95;
        p.vx += (Math.random() - 0.5) * 0.05;
        p.vy += (Math.random() - 0.5) * 0.05;

        p.x += p.vx;
        p.y += p.vy;

        // Keep in sphere
        const len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
        if (len > 0) {
          const targetLen = SPHERE_RADIUS * (0.8 + Math.random() * 0.001);
          p.x = (p.x / len) * targetLen;
          p.y = (p.y / len) * targetLen;
          p.z = (p.z / len) * targetLen;
        }

        const scale = 400 / (400 + p.z);
        const px = p.x * scale + width / 2;
        const py = p.y * scale + height / 2;
        projected.push({ x: p.x, y: p.y, z: p.z, px, py });
      }

      // Draw triangles and lines
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const dx = projected[i].x - projected[j].x;
          const dy = projected[i].y - projected[j].y;
          const dz = projected[i].z - projected[j].z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist < 60) {
            const alpha = Math.max(0, (1 - dist / 60) * 0.35);
            const gradient = ctx!.createLinearGradient(
              projected[i].px,
              projected[i].py,
              projected[j].px,
              projected[j].py
            );
            gradient.addColorStop(0, `rgba(129, 140, 248, ${alpha})`);
            gradient.addColorStop(1, `rgba(167, 139, 250, ${alpha})`);
            ctx!.beginPath();
            ctx!.moveTo(projected[i].px, projected[i].py);
            ctx!.lineTo(projected[j].px, projected[j].py);
            ctx!.strokeStyle = gradient;
            ctx!.lineWidth = 0.6;
            ctx!.stroke();
          }
        }
      }

      // Draw nodes
      for (const p of projected) {
        const depthAlpha = 0.3 + (p.z / (SPHERE_RADIUS * 1.5) + 0.5) * 0.7;
        ctx!.beginPath();
        ctx!.arc(p.px, p.py, 1.2, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(167, 139, 250, ${Math.max(0.1, depthAlpha)})`;
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
    animate();

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