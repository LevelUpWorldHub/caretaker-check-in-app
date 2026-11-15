const RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bdiagnos(?:is|ed|e)\b/i, reason: "medical diagnosis" },
  {
    pattern: /\b(?:alzheimer'?s?|dementia|stroke|seizure|heart attack|cardiac arrest|overdose)\b/i,
    reason: "medical condition claim",
  },
  {
    pattern: /\b(?:call\s+911|call emergency services|medical emergency|ambulance|not breathing|unconscious|unresponsive|collapsed)\b/i,
    reason: "emergency claim",
  },
  {
    pattern: /\b(?:has fallen|had a fall|is injured|in danger|is dying|needs a doctor|go to the (?:er|hospital))\b/i,
    reason: "injury or emergency claim",
  },
];

function withoutDisclaimers(text: string): string {
  return text
    .replace(
      /[^.?!]*(?:not a health assessment|not a medical emergency|not an alarm|has not been sent|nothing (?:was|has been) sent)[^.?!]*[.?!]?/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function verifyText(text: string): { ok: boolean; reasons: string[] } {
  const scanned = withoutDisclaimers(text);
  const reasons = new Set<string>();
  for (const rule of RULES) {
    if (rule.pattern.test(scanned)) reasons.add(rule.reason);
  }
  return { ok: reasons.size === 0, reasons: [...reasons] };
}

export function verifyLines(lines: { text: string }[]): { ok: boolean; reasons: string[] } {
  return verifyText(lines.map((line) => line.text).join("\n"));
}
