/** Linear-interpolation resample of little-endian PCM16 mono. */
export function resamplePcm16(input: Uint8Array, from: number, to: number): Uint8Array {
  if (from === to) return input;
  const src = new Int16Array(input.buffer.slice(input.byteOffset, input.byteOffset + (input.byteLength & ~1)));
  const outLen = Math.floor((src.length * to) / from);
  const out = new Int16Array(outLen);
  const ratio = from / to;
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = src[i0]!;
    const b = src[Math.min(i0 + 1, src.length - 1)]!;
    out[i] = a + (b - a) * frac;
  }
  return new Uint8Array(out.buffer);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
