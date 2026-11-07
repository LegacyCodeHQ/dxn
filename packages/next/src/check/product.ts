/** The first factor changes slowest. With no factors, yield the one empty combination. */
export function* product<T>(factors: readonly (readonly T[])[]): Generator<T[]> {
  if (factors.some((factor) => factor.length === 0)) return;
  const indices = factors.map(() => 0);
  while (true) {
    yield factors.map((factor, i) => factor[indices[i] ?? 0] as T);
    let i = indices.length - 1;
    while (i >= 0 && (indices[i] ?? 0) + 1 >= (factors[i]?.length ?? 0)) {
      indices[i] = 0;
      i--;
    }
    if (i < 0) return;
    indices[i] = (indices[i] ?? 0) + 1;
  }
}
