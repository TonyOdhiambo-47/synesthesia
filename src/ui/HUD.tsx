import React, { useEffect, useState, useRef } from 'react';
import type { AudioData } from '../utils/types';

interface Props {
  modeName: string;
  paletteName: string;
  fps: number;
  audio: AudioData | null;
  showFps: boolean;
  onScreenshot: () => void;
  onRecord: () => void;
  recording: boolean;
}

export default function HUD({ modeName, paletteName, fps, audio, showFps, onScreenshot, onRecord, recording }: Props) {
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);
  const specRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const onMove = () => {
      setVisible(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setVisible(false), 3000);
    };
    onMove();
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    const c = specRef.current;
    if (!c || !audio) return;
    const ctx = c.getContext('2d')!;
    c.width = c.clientWidth * 2; c.height = c.clientHeight * 2;
    ctx.clearRect(0, 0, c.width, c.height);
    const bins = 64;
    const step = Math.floor(audio.spectrum.length / bins);
    const w = c.width / bins;
    for (let i = 0; i < bins; i++) {
      const v = audio.spectrum[i * step] / 255;
      const h = v * c.height;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + v * 0.5})`;
      ctx.fillRect(i * w, c.height - h, w * 0.7, h);
    }
  }, [audio]);

  const op = visible ? 0.85 : 0;
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', transition: 'opacity 0.6s', opacity: op, color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', zIndex: 5 }}>
      <div style={{ position: 'absolute', top: 24, left: 32 }}>
        <div style={{ fontSize: 11, opacity: 0.5 }}>Mode</div>
        <div style={{ fontSize: 18, marginTop: 4, fontWeight: 300 }}>{modeName}</div>
        <div style={{ fontSize: 10, opacity: 0.4, marginTop: 8 }}>Palette · {paletteName}</div>
      </div>
      {showFps && (
        <div style={{ position: 'absolute', top: 24, right: 32, opacity: 0.5 }}>
          {fps.toFixed(0)} FPS
        </div>
      )}
      <canvas ref={specRef} style={{ position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', width: 280, height: 36, opacity: 0.5 }} />
      <div style={{ position: 'absolute', bottom: 24, right: 32, display: 'flex', gap: 12, pointerEvents: 'auto' }}>
        <button onClick={onScreenshot} title="Screenshot" style={btn}>◉</button>
        <button onClick={onRecord} title={recording ? 'Stop' : 'Record'} style={{ ...btn, color: recording ? '#FF3050' : '#fff' }}>●</button>
      </div>
      <div style={{ position: 'absolute', bottom: 24, left: 32, fontSize: 9, opacity: 0.4, lineHeight: 1.8 }}>
        <div>M · Mode</div>
        <div>P · Palette</div>
        <div>G · Gallery</div>
        <div>Space · Capture</div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(255,255,255,0.3)',
  color: '#fff',
  width: 36,
  height: 36,
  borderRadius: '50%',
  cursor: 'pointer',
  fontSize: 16,
  backdropFilter: 'blur(8px)'
};
