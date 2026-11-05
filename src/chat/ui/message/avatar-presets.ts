/**
 * Curated preset pools for avatar parts (Lorelei style).
 * Each num (0-299) maps to a deterministic combination from these pools.
 *
 * Lorelei features: hair (48), eyes (24), mouth (18 happy + 9 sad),
 * brows (13), nose (6), head (4).
 *
 * Colors are controlled natively via DiceBear options (black/white only).
 */

// ── Hair ──────────────────────────────────────────────────────────────────────

/** Male hair — shorter styles (higher variant numbers) + transferred styles */
export const HAIR_MALE: string[] = [
  ...Array.from({ length: 24 }, (_, i) => `variant${String(i + 25).padStart(2, '0')}`).filter(
    (v) => {
      const n = parseInt(v.replace('variant', ''), 10);
      return ![25, 26, 27, 28, 31, 33, 34, 35, 36, 38, 40, 41, 42, 44, 45, 46, 48].includes(n);
    },
  ),
  'variant01',
  'variant02',
  'variant03',
  'variant04',
  'variant06',
  'variant07',
  'variant08',
  'variant09',
  'variant11',
  'variant12',
  'variant22',
];

/** Female hair — longer styles (lower variant numbers) + transferred styles */
export const HAIR_FEMALE: string[] = [
  ...Array.from({ length: 24 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`).filter(
    (v) => {
      const n = parseInt(v.replace('variant', ''), 10);
      return ![1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 22].includes(n);
    },
  ),
  'variant31',
  'variant33',
  'variant35',
  'variant36',
  'variant38',
  'variant42',
  'variant46',
  'variant48',
];

// ── Eyes ──────────────────────────────────────────────────────────────────────

export const EYES_MALE: string[] = Array.from(
  { length: 24 },
  (_, i) => `variant${String(i + 1).padStart(2, '0')}`,
).filter((v) => {
  const n = parseInt(v.replace('variant', ''), 10);
  return [2, 4, 6, 8, 10, 12, 16, 17, 20].includes(n);
});

export const EYES_FEMALE: string[] = Array.from(
  { length: 24 },
  (_, i) => `variant${String(i + 1).padStart(2, '0')}`,
).filter((v) => {
  const n = parseInt(v.replace('variant', ''), 10);
  return [7, 9, 11, 14, 21, 23, 24].includes(n);
});

// ── Mouth — first 4 happy variants ─────────────────────────────────────────

export const MOUTH: string[] = [
  'happy01',
  'happy02',
  'happy03',
  'happy04',
  'happy05',
  'happy06',
  'happy14',
];

// ── Eyebrows ──────────────────────────────────────────────────────────────────

export const BROWS: string[] = Array.from(
  { length: 13 },
  (_, i) => `variant${String(i + 1).padStart(2, '0')}`,
).filter(
  (v) =>
    !['variant01', 'variant02', 'variant04', 'variant08', 'variant11', 'variant12'].includes(v),
);

// ── Nose ──────────────────────────────────────────────────────────────────────

export const NOSE: string[] = Array.from(
  { length: 6 },
  (_, i) => `variant${String(i + 1).padStart(2, '0')}`,
);

// ── Face shape (Head) ─────────────────────────────────────────────────────────

export const HEAD: string[] = ['variant01', 'variant02', 'variant03', 'variant04'];

// ── Mapping logic ─────────────────────────────────────────────────────────────

export interface AvatarPreset {
  hair: string;
  eyes: string;
  mouth: string;
  brows: string;
  nose: string;
  head: string;
}

/**
 * Get a deterministic preset combination for a given num (0-299).
 * Uses the num and gender to distribute selections across the curated pools.
 */
export function getAvatarPreset(num: number, gender: 'male' | 'female'): AvatarPreset {
  const idx = ((num % 300) + 300) % 300;
  const hairPool = gender === 'male' ? HAIR_MALE : HAIR_FEMALE;
  const eyesPool = gender === 'male' ? EYES_MALE : EYES_FEMALE;

  // Use different strides so each num produces a unique combination
  return {
    hair: hairPool[idx % hairPool.length],
    eyes: eyesPool[Math.floor(idx / 3) % eyesPool.length],
    mouth: MOUTH[Math.floor(idx / 7) % MOUTH.length],
    brows: BROWS[Math.floor(idx / 11) % BROWS.length],
    nose: NOSE[Math.floor(idx / 13) % NOSE.length],
    head: HEAD[Math.floor(idx / 17) % HEAD.length],
  };
}
