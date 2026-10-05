// シードで固定できる乱数(D-021)。
// mulberry32 という短い作り方を使う。同じシードなら、同じ数の並びが出る。

/** シードを 32 ビットの整数(0〜4294967295)にそろえる。数字でない文字列も受け付ける。 */
export function normalizeSeed(input) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.trunc(input) >>> 0;
  }
  const text = String(input ?? "").trim();
  if (/^\d+$/.test(text)) {
    return Number(BigInt(text) % 4294967296n);
  }
  // 文字列は、簡単なハッシュ(文字から数を作る計算)で数にする。
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** シードから乱数の関数を作る。呼ぶたびに 0 以上 1 未満の数を返す。 */
export function createRng(seed) {
  let a = normalizeSeed(seed);
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
