// Number & duration formatting. 3 significant digits, consistent everywhere.

const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) {
    if (Number.isInteger(n)) return String(n);
    if (n < 10) return n.toFixed(2).replace(/\.?0+$/, '');
    if (n < 100) return n.toFixed(1).replace(/\.0$/, '');
    return String(Math.floor(n));
  }
  let tier = Math.floor(Math.log10(n) / 3);
  if (tier >= UNITS.length) return n.toExponential(2).replace('+', '');
  const scaled = n / Math.pow(10, tier * 3);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return scaled.toFixed(digits) + UNITS[tier];
}

// Whole-number display for resource stockpiles ≥ 1000; decimals below that.
export function fmtRes(n) {
  if (n < 1000) return fmt(Math.floor(n * 10) / 10);
  return fmt(Math.floor(n));
}

export function fmtRate(n) {
  if (Math.abs(n) < 0.005) return '0/s';
  return (n > 0 ? '+' : '') + fmt(Math.round(n * 100) / 100) + '/s';
}

export function fmtTime(secs) {
  if (!isFinite(secs)) return '∞';
  secs = Math.max(0, Math.round(secs));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  if (secs < 86400) {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600);
  return h ? `${d}d ${h}h` : `${d}d`;
}

// "cost object" -> "12 Wood, 5 Stone"
export function fmtCost(cost, names) {
  return Object.entries(cost)
    .map(([k, v]) => `${fmt(Math.ceil(v))} ${names[k]?.name || k}`)
    .join(', ');
}
