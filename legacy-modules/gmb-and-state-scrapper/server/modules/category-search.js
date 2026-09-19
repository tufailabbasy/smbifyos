function cleanInlineText(value = "") {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "and",
  "for",
  "the",
  "with",
  "services",
  "service",
  "company",
  "business",
]);

const CATEGORY_EXPANSIONS = [
  {
    match:
      /\bplumb(?:er|ing)?\b|\brooter\b|\bdrain\b|\bsewer\b|\bpipe\b|\bwater heater\b/i,
    terms: [
      "plumber",
      "plumbing",
      "rooter",
      "drain",
      "sewer",
      "pipe",
      "water heater",
    ],
  },
  {
    match:
      /\bwater damage\b|\bwater mitigation\b|\bflood\b|\brestoration\b|\bmold\b|\bremediation\b/i,
    terms: [
      "water damage",
      "water mitigation",
      "water restoration",
      "restoration",
      "flood cleanup",
      "flood restoration",
      "mold remediation",
      "remediation",
    ],
  },
  {
    match:
      /\bhvac\b|\bheating\b|\bcooling\b|\bair conditioning\b|\bac repair\b|\bfurnace\b/i,
    terms: [
      "hvac",
      "heating",
      "cooling",
      "air conditioning",
      "ac repair",
      "furnace",
    ],
  },
  {
    match: /\belectric(?:ian|al)?\b|\bwiring\b|\bgenerator\b/i,
    terms: ["electrician", "electrical", "electric", "wiring", "generator"],
  },
  {
    match: /\broof(?:er|ing)?\b|\bgutter\b/i,
    terms: ["roofer", "roofing", "roof repair", "gutter"],
  },
  {
    match: /\bpest\b|\btermite\b|\bexterminator\b|\bwildlife removal\b/i,
    terms: ["pest control", "exterminator", "termite", "wildlife removal"],
  },
  {
    match: /\bclean(?:ing)?\b|\bjanitorial\b|\bmaid\b/i,
    terms: ["cleaning", "janitorial", "maid service", "housekeeping"],
  },
  {
    match: /\bpaint(?:er|ing)?\b|\bcoating\b/i,
    terms: ["painter", "painting", "coating"],
  },
];

function buildCategorySearchPlan(businessType = "", { maxTerms = 6 } = {}) {
  const normalizedBusinessType = cleanInlineText(businessType);
  const lowerBusinessType = normalizedBusinessType.toLowerCase();
  const terms = [];
  const keywords = new Set();
  const seenTerms = new Set();

  function addTerm(term) {
    const normalizedTerm = cleanInlineText(term);
    const loweredTerm = normalizedTerm.toLowerCase();

    if (!normalizedTerm || seenTerms.has(loweredTerm)) {
      return;
    }

    seenTerms.add(loweredTerm);
    terms.push(normalizedTerm);

    loweredTerm
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
      .forEach((token) => keywords.add(token));
  }

  addTerm(normalizedBusinessType);

  CATEGORY_EXPANSIONS.forEach((group) => {
    if (group.match.test(lowerBusinessType)) {
      group.terms.forEach(addTerm);
    }
  });

  lowerBusinessType
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .forEach((token) => keywords.add(token));

  return {
    original: normalizedBusinessType,
    terms: terms.slice(0, maxTerms),
    keywords: [...keywords],
  };
}

function getRecordDedupKey(record = {}) {
  const sourceUrl = cleanInlineText(record.sourceUrl).toLowerCase();
  const businessName = cleanInlineText(record.businessName).toLowerCase();
  const city = cleanInlineText(record.city).toLowerCase();
  const state = cleanInlineText(record.state).toLowerCase();

  return [
    sourceUrl,
    businessName,
    city,
    state,
  ]
    .filter(Boolean)
    .join("|");
}

function scoreRecord(record = {}, plan = {}) {
  const haystack = cleanInlineText(record.businessName).toLowerCase();
  const original = cleanInlineText(plan.original).toLowerCase();
  let score = 0;

  if (original && haystack.includes(original)) {
    score += 12;
  }

  (plan.terms || []).forEach((term) => {
    const normalizedTerm = cleanInlineText(term).toLowerCase();

    if (!normalizedTerm || normalizedTerm === original) {
      return;
    }

    if (haystack.includes(normalizedTerm)) {
      score += normalizedTerm.includes(" ") ? 8 : 4;
    }
  });

  (plan.keywords || []).forEach((keyword) => {
    if (haystack.includes(keyword)) {
      score += 2;
    }
  });

  return score;
}

function dedupeAndRankRecords(records = [], plan = {}) {
  const deduped = new Map();

  records.forEach((record, index) => {
    const dedupKey = getRecordDedupKey(record);
    const scoredRecord = {
      ...record,
      _dedupKey: dedupKey,
      _score: scoreRecord(record, plan),
      _index: index,
    };
    const existingRecord = deduped.get(dedupKey);

    if (
      !existingRecord ||
      scoredRecord._score > existingRecord._score ||
      (scoredRecord._score === existingRecord._score &&
        scoredRecord._index < existingRecord._index)
    ) {
      deduped.set(dedupKey, scoredRecord);
    }
  });

  const ranked = [...deduped.values()].sort((left, right) => {
    return right._score - left._score || left._index - right._index;
  });

  return ranked.map(({ _dedupKey, _score, _index, ...record }) => record);
}

module.exports = {
  buildCategorySearchPlan,
  dedupeAndRankRecords,
  getRecordDedupKey,
};
