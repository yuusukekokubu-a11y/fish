// 数の短い表示(D-116)。1 万未満はそのまま、1 万以上は「1.2万」、1 億以上は「1.2億」、1 兆以上は「1.2兆」。
// 小数は 1 けたで、切り捨てる(実際より多く見せない)。単位の前が 1000 以上なら小数は出さない(9999万)。

const UNITS = [
  [1e12, "兆"],
  [1e8, "億"],
  [1e4, "万"],
];

export function formatCount(n) {
  if (!Number.isFinite(n)) return "0";
  const value = Math.max(0, Math.floor(n));
  for (const [size, unit] of UNITS) {
    if (value >= size) {
      const scaled = Math.floor((value / size) * 10) / 10;
      // 1 万兆(1 京)をこえても「兆」で出す(けたが増えるだけ)。
      const text = scaled >= 1000 ? String(Math.floor(scaled)) : scaled.toFixed(scaled % 1 === 0 ? 0 : 1);
      return `${text}${unit}`;
    }
  }
  return String(value);
}
