// Small deterministic PRNG so numbers stay stable across a session for a given seed
// (mulberry32). Not cryptographic — it just makes the demo data look "real" and consistent.
export function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

export function rngFor(seed: string) {
  return mulberry32(hashSeed(seed));
}

export function pickInt(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function pickFloat(rng: () => number, min: number, max: number) {
  return rng() * (max - min) + min;
}
