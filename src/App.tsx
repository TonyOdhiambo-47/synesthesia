import React, { useEffect, useRef, useState, useCallback } from 'react';
import Landing from './ui/Landing';
import HUD from './ui/HUD';
import { Engine } from './engine/Engine';
import type { AudioData } from './utils/types';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  // Track captureStream tracks so we can stop them on record-stop / unmount.
  const recordStreamRef = useRef<MediaStream | null>(null);
  // Latest recording state for stable callbacks (avoids stale-closure bug in keydown).
  const recordingRef = useRef(false);
  // Guard against double-start and post-unmount async resumption of handleEnter.
  const startingRef = useRef(false);
  const mountedRef = useRef(true);

  const [started, setStarted] = useState(false);
  const [modeName, setModeName] = useState('Nebula');
  const [paletteName, setPaletteName] = useState('aurora');
  const [fps, setFps] = useState(0);
  const [audio, setAudio] = useState<AudioData | null>(null);
  const [showFps, setShowFps] = useState(false);
  const [recording, setRecording] = useState(false);

  // Keep recordingRef in sync with state.
  useEffect(() => { recordingRef.current = recording; }, [recording]);

  const handleEnter = async (camera: boolean) => {
    if (startingRef.current || engineRef.current) return;
    startingRef.current = true;
    setStarted(true);
    // Wait one frame so canvas is mounted.
    await new Promise(r => requestAnimationFrame(r));
    if (!mountedRef.current) { startingRef.current = false; return; }
    const canvas = canvasRef.current;
    if (!canvas) { startingRef.current = false; return; }
    const engine = new Engine(canvas, {
      onModeChange: setModeName,
      onPaletteChange: setPaletteName,
      onFps: setFps,
      onAudio: setAudio
    });
    engineRef.current = engine;
    try { await engine.start({ camera, mic: true }); }
    finally { startingRef.current = false; }
    // If component unmounted during start(), tear the engine down now.
    if (!mountedRef.current) {
      try { engine.destroy(); } catch { /* ignore */ }
      engineRef.current = null;
    }
  };

  // Engine teardown on unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try { engineRef.current?.destroy(); } catch { /* ignore */ }
      engineRef.current = null;
      stopRecorderAndStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecorderAndStream = () => {
    const mr = recorderRef.current;
    if (mr && mr.state !== 'inactive') {
      try { mr.stop(); } catch { /* ignore */ }
    }
    recorderRef.current = null;
    const stream = recordStreamRef.current;
    if (stream) {
      for (const t of stream.getTracks()) { try { t.stop(); } catch { /* ignore */ } }
      recordStreamRef.current = null;
    }
  };

  // Stable callbacks via refs — keydown listener never closes over a stale copy.
  const downloadScreenshot = useCallback(async () => {
    const eng = engineRef.current; if (!eng) return;
    try {
      const url = await eng.screenshot();
      const a = document.createElement('a');
      a.href = url;
      a.download = `synesthesia-${Date.now()}.png`;
      a.click();
    } catch (e) {
      console.warn('Screenshot failed:', e);
    }
  }, []);

  const toggleRecord = useCallback(() => {
    const eng = engineRef.current; if (!eng) return;
    if (recordingRef.current) {
      stopRecorderAndStream();
      recordingRef.current = false;
      setRecording(false);
      return;
    }
    const canvas = canvasRef.current; if (!canvas) return;
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
    recordStreamRef.current = stream;
    recordingRef.current = true;
    setRecording(true);
  }, []);

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
  }, [started, downloadScreenshot, toggleRecord]);

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
