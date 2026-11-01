import React, { useEffect, useRef } from 'react';

export type ChatThemeType = 
  | 'default'
  | 'aurora'
  | 'cyberpunk'
  | 'forest'
  | 'sunset'
  | 'matrix'
  | 'galaxy'
  | 'oled';

interface AnimatedChatWallpaperProps {
  theme: ChatThemeType;
  opacity?: number; // 0.1 to 1.0
  speed?: 'off' | 'low' | 'normal' | 'fast';
}

export const AnimatedChatWallpaper: React.FC<AnimatedChatWallpaperProps> = ({
  theme = 'default',
  opacity = 0.85,
  speed = 'normal',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (theme === 'default') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', handleResize);

    const speedMultiplier = speed === 'off' ? 0 : speed === 'low' ? 0.4 : speed === 'fast' ? 1.6 : 1.0;
    let tick = 0;

    // Theme: Matrix Rain State
    const fontSize = 14;
    const columns = Math.floor(width / fontSize);
    const drops = Array(columns).fill(1);
    const matrixChars = '0123456789ABCDEFHIJKLMNOPQRSTUVWXYZアイウエオカキクケコ';

    // Theme: Galaxy & Forest Particles
    const particles = Array.from({ length: 65 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2.2 + 0.6,
      vx: (Math.random() - 0.5) * 0.4 * speedMultiplier,
      vy: (Math.random() - 0.5) * 0.4 * speedMultiplier,
      alpha: Math.random() * 0.7 + 0.3,
      alphaSpeed: (Math.random() * 0.02 + 0.005) * speedMultiplier,
    }));

    const render = () => {
      tick += 0.015 * speedMultiplier;

      if (theme === 'matrix') {
        ctx.fillStyle = 'rgba(6, 12, 10, 0.12)';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#10B981';
        ctx.font = `${fontSize}px monospace`;

        for (let i = 0; i < drops.length; i++) {
          const char = matrixChars[Math.floor(Math.random() * matrixChars.length)];
          const x = i * fontSize;
          const y = drops[i] * fontSize;

          ctx.fillText(char, x, y);

          if (y > height && Math.random() > 0.975) {
            drops[i] = 0;
          }
          if (speedMultiplier > 0) {
            drops[i]++;
          }
        }
      } else if (theme === 'aurora') {
        ctx.fillStyle = '#050B14';
        ctx.fillRect(0, 0, width, height);

        // Draw shifting curved luminous ribbons
        for (let r = 0; r < 3; r++) {
          const grad = ctx.createLinearGradient(0, height * 0.1, width, height * 0.9);
          if (r === 0) {
            grad.addColorStop(0, 'rgba(16, 185, 129, 0.15)'); // Emerald
            grad.addColorStop(1, 'rgba(6, 182, 212, 0.25)'); // Cyan
          } else if (r === 1) {
            grad.addColorStop(0, 'rgba(139, 92, 246, 0.20)'); // Purple
            grad.addColorStop(1, 'rgba(59, 130, 246, 0.15)'); // Blue
          } else {
            grad.addColorStop(0, 'rgba(236, 72, 153, 0.12)'); // Pink
            grad.addColorStop(1, 'rgba(16, 185, 129, 0.18)'); // Emerald
          }

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(0, height);

          const step = 40;
          for (let x = 0; x <= width + step; x += step) {
            const waveY =
              Math.sin(x * 0.003 + tick + r) * 70 +
              Math.cos(x * 0.002 - tick * 0.8 + r) * 50 +
              height * (0.35 + r * 0.15);
            ctx.lineTo(x, waveY);
          }

          ctx.lineTo(width, height);
          ctx.closePath();
          ctx.fill();
        }
      } else if (theme === 'cyberpunk') {
        ctx.fillStyle = '#090814';
        ctx.fillRect(0, 0, width, height);

        // Synthwave perspective grid
        const horizon = height * 0.55;
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.22)';
        ctx.lineWidth = 1;

        // Radiating perspective lines
        const vanishingX = width / 2;
        for (let x = -width; x <= width * 2; x += 60) {
          ctx.beginPath();
          ctx.moveTo(vanishingX, horizon);
          ctx.lineTo(x, height);
          ctx.stroke();
        }

        // Horizontal moving grid lines
        const offset = (tick * 40) % 30;
        for (let y = horizon; y < height; y += (y - horizon) * 0.25 + 6) {
          const actualY = y + offset;
          if (actualY <= height) {
            ctx.beginPath();
            ctx.moveTo(0, actualY);
            ctx.lineTo(width, actualY);
            ctx.stroke();
          }
        }

        // Glowing sun
        const sunGrad = ctx.createLinearGradient(vanishingX, horizon - 90, vanishingX, horizon);
        sunGrad.addColorStop(0, 'rgba(244, 63, 94, 0.4)');
        sunGrad.addColorStop(1, 'rgba(234, 179, 8, 0.1)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(vanishingX, horizon, 80, Math.PI, 0, false);
        ctx.fill();
      } else if (theme === 'forest') {
        ctx.fillStyle = '#05110B';
        ctx.fillRect(0, 0, width, height);

        // Bioluminescent Fireflies
        particles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.alpha += p.alphaSpeed;
          if (p.alpha > 0.8 || p.alpha < 0.2) p.alphaSpeed = -p.alphaSpeed;

          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
          glow.addColorStop(0, `rgba(163, 230, 53, ${p.alpha})`);
          glow.addColorStop(1, 'rgba(163, 230, 53, 0)');

          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (theme === 'sunset') {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
        bgGrad.addColorStop(0, '#1E0E1F');
        bgGrad.addColorStop(0.5, '#2D132C');
        bgGrad.addColorStop(1, '#1A0C16');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Warm floating gold dust motes
        particles.forEach((p) => {
          p.y -= Math.abs(p.vy);
          if (p.y < 0) p.y = height;
          ctx.fillStyle = `rgba(251, 191, 36, ${p.alpha * 0.7})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (theme === 'galaxy') {
        ctx.fillStyle = '#04060E';
        ctx.fillRect(0, 0, width, height);

        // Nebula cloud
        const nebula = ctx.createRadialGradient(width * 0.7, height * 0.3, 0, width * 0.7, height * 0.3, width * 0.6);
        nebula.addColorStop(0, 'rgba(124, 58, 237, 0.14)');
        nebula.addColorStop(0.6, 'rgba(6, 182, 212, 0.08)');
        nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebula;
        ctx.fillRect(0, 0, width, height);

        // Twinkling stars
        particles.forEach((p) => {
          p.alpha += p.alphaSpeed;
          if (p.alpha > 0.95 || p.alpha < 0.15) p.alphaSpeed = -p.alphaSpeed;

          ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.9, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (theme === 'oled') {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Subtle OLED hex dot grid
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        const gap = 24;
        for (let x = 0; x < width; x += gap) {
          for (let y = 0; y < height; y += gap) {
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [theme, speed]);

  if (theme === 'default') return null;

  return (
    <div
      style={{ opacity }}
      className="absolute inset-0 pointer-events-none overflow-hidden z-0 transition-opacity duration-300"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
