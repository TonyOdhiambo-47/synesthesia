import React, { useEffect, useRef } from 'react';

interface Props {
  onEnter: (camera: boolean) => void;
}

// Simple ambient canvas animation behind the title — minimal Nebula imitation
// using Canvas2D so it's lightweight and runs even before WebGL initializes.
export default function Landing({ onEnter }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    };
    resize();
    window.addEventListener('resize', resize);

    interface P { x: number; y: number; vx: number; vy: number; }
    const N = 220;
    const ps: P[] = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4
    }));

    let raf = 0;
    const loop = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 30 * dpr);
        grd.addColorStop(0, 'rgba(0, 255, 178, 0.35)');
        grd.addColorStop(1, 'rgba(0, 100, 200, 0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 30 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', background: '#000', zIndex: 10
    }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, opacity: 0.7 }} />
      <div style={{ position: 'relative', textAlign: 'center', padding: 24 }}>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 'clamp(64px, 12vw, 180px)',
          fontWeight: 300,
          margin: 0,
          letterSpacing: '0.04em',
          background: 'linear-gradient(180deg, #fff 0%, #88c 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '0 0 60px rgba(120, 200, 255, 0.4)'
        }}>
          Synesthesia
        </h1>
        <p style={{
          fontSize: 'clamp(14px, 1.6vw, 22px)',
          letterSpacing: '0.5em',
          textTransform: 'uppercase',
          opacity: 0.7,
          margin: '8px 0 48px',
          fontWeight: 300
        }}>
          Move · Listen · Create
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => onEnter(true)} style={btnStyle(true)}>Enter</button>
          <button onClick={() => onEnter(false)} style={btnStyle(false)}>Keyboard Only</button>
        </div>
        <p style={{ marginTop: 36, opacity: 0.4, fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          A real-time gesture-controlled generative art engine
        </p>
      </div>
    </div>
  );
}

const btnStyle = (primary: boolean): React.CSSProperties => ({
  background: primary ? 'rgba(255,255,255,0.95)' : 'transparent',
  color: primary ? '#000' : '#fff',
  border: '1px solid rgba(255,255,255,0.6)',
  padding: '14px 36px',
  fontSize: 14,
  letterSpacing: '0.25em',
  textTransform: 'uppercase',
  fontFamily: 'inherit',
  cursor: 'pointer',
  borderRadius: 2,
  transition: 'all 0.3s ease',
  backdropFilter: 'blur(8px)'
});
