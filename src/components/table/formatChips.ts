/** Format chip stacks for table display (compact, readable). */
export function formatChips(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  const n = Math.max(0, Math.round(amount));
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${trimDec(m)}M`;
  }
  if (n >= 10_000) {
    const k = n / 1_000;
    return `${trimDec(k)}k`;
  }
  return n.toLocaleString('en-US');
}

function trimDec(n: number): string {
  const s = n.toFixed(n >= 10 || Number.isInteger(n) ? 0 : 1);
  return s.replace(/\.0$/, '');
}
