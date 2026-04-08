import type { Palette } from './types';

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export const PALETTES: Palette[] = [
  {
    name: 'aurora',
    bg: hex('#050510'),
    colors: [hex('#00FFB2'), hex('#FF006E'), hex('#B8FFF4'), hex('#7B2FBE'), hex('#00B4D8')],
    glow: [0, 1, 0.7, 0.15]
  },
  {
    name: 'ember',
    bg: hex('#0A0505'),
    colors: [hex('#FF4500'), hex('#FF8C00'), hex('#FFD700'), hex('#8B0000'), hex('#FF6347')],
    glow: [1, 0.27, 0, 0.15]
  },
  {
    name: 'phantom',
    bg: hex('#000000'),
    colors: [hex('#FFFFFF'), hex('#C0C0C0'), hex('#808080'), hex('#E0E0E0'), hex('#A0A0A0')],
    glow: [1, 1, 1, 0.1]
  },
  {
    name: 'reef',
    bg: hex('#020812'),
    colors: [hex('#00FFFF'), hex('#7B68EE'), hex('#00CED1'), hex('#9370DB'), hex('#40E0D0')],
    glow: [0, 1, 1, 0.12]
  }
];
