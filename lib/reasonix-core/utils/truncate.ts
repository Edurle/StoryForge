export const DEFAULT_MAX_RESULT_CHARS = 32_000;
export const DEFAULT_MAX_RESULT_TOKENS = 8_000;

export function truncateForModel(s: string, maxChars: number, extraNote?: string): string {
  if (s.length <= maxChars) return s;
  const tailBudget = Math.min(1024, Math.floor(maxChars * 0.1));
  const headBudget = Math.max(0, maxChars - tailBudget);
  const head = sliceAlignedToCodepoint(s, headBudget);
  const tail = sliceSuffixAlignedToCodepoint(s, tailBudget);
  const dropped = s.length - head.length - tail.length;
  const note = extraNote ? ` — ${extraNote}` : "";
  return `${head}\n\n[…truncated ${dropped} chars…${note}]\n\n${tail}`;
}

function sliceAlignedToCodepoint(s: string, end: number): string {
  if (end <= 0) return "";
  if (end >= s.length) return s;
  const last = s.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) return s.slice(0, end - 1);
  return s.slice(0, end);
}

function sliceSuffixAlignedToCodepoint(s: string, len: number): string {
  if (len <= 0) return "";
  if (len >= s.length) return s;
  const start = s.length - len;
  const first = s.charCodeAt(start);
  if (first >= 0xdc00 && first <= 0xdfff) return s.slice(start + 1);
  return s.slice(start);
}
