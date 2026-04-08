import React, { useEffect, useRef, useState } from 'react';
import Landing from './ui/Landing';
import HUD from './ui/HUD';
import { Engine } from './engine/Engine';
import type { AudioData } from './utils/types';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [started, setStarted] = useState(false);
  const [modeName, setModeName] = useState('Nebula');
  const [paletteName, setPaletteName] = useState('aurora');
  const [fps, setFps] = useState(0);
  const [audio, setAudio] = useState<AudioData | null>(null);
  const [showFps, setShowFps] = useState(false);
  const [recording, setRecording] = useState(false);

  const handleEnter = async (camera: boolean) => {
    setStarted(true);
    // Wait one frame so canvas is mounted.
    await new Promise(r => requestAnimationFrame(r));
    const canvas = canvasRef.current!;
    const engine = new Engine(canvas, {
      onModeChange: setModeName,
      onPaletteChange: setPaletteName,
      onFps: setFps,
      onAudio: setAudio
    });
    engineRef.current = engine;
    await engine.start({ camera, mic: true });
  };

  // Keyboard shortcuts.
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      const eng = engineRef.current; if (!eng) return;
      switch (e.key.toLowerCase()) {
        case 'm': eng.cycleMode(); break;
        case 'p': eng.cyclePalette(); break;
        case 'g': eng.toggleGallery(); break;
        case '`': setShowFps(s => !s); break;
        case ' ':
          e.preventDefault();
          downloadScreenshot();
          break;
        case 'r': toggleRecord(); break;
        case '1': eng.setMode(0); break;
        case '2': eng.setMode(1); break;
        case '3': eng.setMode(2); break;
        case '4': eng.setMode(3); break;
        case '5': eng.setMode(4); break;
      }
    };
    window.addEventListener('keydown', onKey);

    // Mouse → synthetic hand for keyboard-only mode.
    const onMouse = (e: MouseEvent) => {
      const eng = engineRef.current; if (!eng || !eng.noCamera) return;
      eng.setSyntheticHand(e.clientX / window.innerWidth, e.clientY / window.innerHeight, true);
    };
    window.addEventListener('mousemove', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onMouse);
    };
  }, [started]);

  const downloadScreenshot = () => {
    const eng = engineRef.current; if (!eng) return;
    const url = eng.screenshot();
    const a = document.createElement('a');
    a.href = url;
    a.download = `synesthesia-${Date.now()}.png`;
    a.click();
  };

  const toggleRecord = () => {
    const eng = engineRef.current; if (!eng) return;
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    const canvas = canvasRef.current!;
    const stream = canvas.captureStream(60);
    const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 12_000_000 });
    recordedChunksRef.current = [];
    mr.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `synesthesia-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };
    mr.start();
    recorderRef.current = mr;
    setRecording(true);
  };

  return (
    <>
      {!started && <Landing onEnter={handleEnter} />}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          display: started ? 'block' : 'none'
        }}
      />
      {started && (
        <HUD
          modeName={modeName}
          paletteName={paletteName}
          fps={fps}
          audio={audio}
          showFps={showFps}
          onScreenshot={downloadScreenshot}
          onRecord={toggleRecord}
          recording={recording}
        />
      )}
    </>
  );
}
