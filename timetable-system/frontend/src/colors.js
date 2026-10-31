export const hueOf = (str) => {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};

// Every subject gets its own colour (golden-angle spacing keeps neighbours distinct).
export const subjectHue = (data, subjectId) => {
  const i = data.subjects.findIndex((s) => s.id === subjectId);
  return ((i < 0 ? 0 : i) * 137.508) % 360;
};

export function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}
