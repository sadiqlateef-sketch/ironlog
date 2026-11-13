// Open Food Facts sometimes sends names with HTML entities left in
// (&quot;, &amp;, &#39;, &eacute;). Turn them back into the characters.

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  shy: "",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  micro: "µ",
  middot: "·",
  bull: "•",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  times: "×",
  euro: "€",
  pound: "£",
  szlig: "ß",
  aelig: "æ",
  AElig: "Æ",
  oslash: "ø",
  Oslash: "Ø",
  oelig: "œ",
  OElig: "Œ",
  eth: "ð",
  thorn: "þ",
};

/** Accent entities like &eacute; are a letter plus a combining mark. */
const MARKS: Record<string, string> = {
  acute: "́",
  grave: "̀",
  circ: "̂",
  uml: "̈",
  tilde: "̃",
  cedil: "̧",
  ring: "̊",
  caron: "̌",
};

function fromCodePoint(n: number): string | null {
  if (!Number.isInteger(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return null;
  return String.fromCodePoint(n);
}

/** Decode named and numeric HTML entities once. Unknown entities are left as they are. */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,9});/g, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const ch = fromCodePoint(parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10));
      return ch ?? whole;
    }
    if (body in NAMED) return NAMED[body];
    const m = /^([A-Za-z])(acute|grave|circ|uml|tilde|cedil|ring|caron)$/.exec(body);
    if (m) return (m[1] + MARKS[m[2]]).normalize("NFC");
    return whole;
  });
}
