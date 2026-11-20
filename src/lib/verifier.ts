/**
 * Blocks wording that claims a diagnosis, a medical condition, an injury, or an emergency.
 * Every pattern is linear: no nested quantifiers, no sentence-spanning wildcards.
 * Large inputs stay fast, and a disclaimer cannot hide a claim next to it.
 */
const RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bdiagnos\w*/i, reason: "medical diagnosis" },
  {
    pattern:
      /\b(?:alzheimer\w*|dementia\w*|parkinson\w*|cancer\w*|tumou?rs?|seizures?|epilep\w*|concussion\w*|heart (?:attack|failure|condition|problem)s?|cardiac|overdos\w*|cognitive (?:decline|impairment)|disorient\w*|hypotherm\w*|dehydrat\w*|pneumonia|sepsis|infarct\w*|aneurysms?|hemorrhag\w*|haemorrhag\w*)\b/i,
    reason: "medical condition claim",
  },
  {
    // "stroke" as an illness, not "a stroke of luck" or "stroke-play golf".
    pattern: /\bstrokes?\b(?!\s+of\s+(?:luck|genius|midnight|the (?:pen|brush|clock)))(?!\s*-\s*play)(?!\s+play)/i,
    reason: "medical condition claim",
  },
  {
    pattern:
      /\b(?:(?:call|dial|phone|ring|contact)\s+(?:9\s*-?\s*1\s*-?\s*1|emergency|an ambulance|the paramedics)|9\s*-\s*1\s*-\s*1|911|emergency (?:room|services|department)|medical emergency|ambulance|paramedics?|not breathing|stopped breathing|unconscious|unresponsive|collapsed|passed out|faint(?:ed|ing)|blacked out)\b/i,
    reason: "emergency claim",
  },
  {
    pattern:
      /\b(?:fell(?!\s+(?:asleep|behind|silent|quiet|in love|off|to|below|short|through|inside|within|outside|between|during|on|after|before|at|into|under|above))|has fallen|had a fall|took a fall|a bad fall|is injured|injur(?:ed|y|ies)|in danger|(?:is|was) dying|needs? a doctor|go to the (?:er|hospital)|take (?:her|him|them) to the (?:er|hospital)|hospitali[sz]\w*|admitted to (?:the )?hospital|broke (?:her|his|their|a) (?:hip|leg|arm|wrist|ankle|bone|neck)|fractur\w*|bleeding|bled)\b/i,
    reason: "injury or emergency claim",
  },
];

/** Only these exact phrases are removed before scanning. The rest of the sentence is still checked. */
const DISCLAIMERS =
  /\b(?:not a health assessment|not a medical emergency|not an emergency|not an alarm|has not been sent|nothing (?:was|has been) sent)\b/gi;

const CONFUSABLES: Record<string, string> = {
  "\u0430": "a", "\u0435": "e", "\u0456": "i", "\u0458": "j", "\u043e": "o", "\u0440": "p", "\u0441": "c",
  "\u0443": "y", "\u0445": "x", "\u0455": "s", "\u0501": "d", "\u0261": "g", "\u04bb": "h", "\u0410": "A",
  "\u0415": "E", "\u0406": "I", "\u041e": "O", "\u0420": "P", "\u0421": "C", "\u0425": "X", "\u0405": "S",
  "\u03b1": "a", "\u03bf": "o", "\u03b9": "i", "\u03c1": "p", "\u0391": "A", "\u0395": "E", "\u0399": "I",
  "\u039f": "O", "\u03a1": "P", "\u0131": "i",
};

const MAX_SCAN = 1_000_000;

/** NFKC, strip zero-width and soft hyphens, fold common Cyrillic and Greek look-alikes, and unify quotes. */
export function normalizeForScan(text: string): string {
  return text
    .slice(0, MAX_SCAN)
    .normalize("NFKC")
    .replace(/[\u00ad\u200b-\u200f\u2060-\u2064\ufeff\u180e]/g, "")
    .replace(/[\u0430\u0435\u0456\u0458\u043e\u0440\u0441\u0443\u0445\u0455\u0501\u0261\u04bb\u0410\u0415\u0406\u041e\u0420\u0421\u0425\u0405\u03b1\u03bf\u03b9\u03c1\u0391\u0395\u0399\u039f\u03a1\u0131]/g, (ch) => CONFUSABLES[ch] ?? ch)
    .replace(/[\u2018\u2019\u02bc\u2032`]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-");
}

export function verifyText(text: string): { ok: boolean; reasons: string[] } {
  if (typeof text !== "string") return { ok: false, reasons: ["not text"] };
  if (text.length > MAX_SCAN) return { ok: false, reasons: ["too long"] };
  const scanned = normalizeForScan(text).replace(DISCLAIMERS, " | ");
  const reasons = new Set<string>();
  for (const rule of RULES) {
    if (rule.pattern.test(scanned)) reasons.add(rule.reason);
  }
  return { ok: reasons.size === 0, reasons: [...reasons] };
}

export function verifyLines(lines: { text: string }[]): { ok: boolean; reasons: string[] } {
  return verifyText(lines.map((line) => line.text).join("\n"));
}
