import type { DatasetProfile } from "../types";

export type RefusalCategory =
  | "not_about_dataset"
  | "missing_information"
  | "not_computable"
  | "ungrounded_number";

export type GuardrailDecision =
  | { allowed: true }
  | {
      allowed: false;
      category: RefusalCategory;
      detail: string;
    };

type AvailableInformation = {
  sales: boolean;
  profit: boolean;
  cost: boolean;
  margin: boolean;
  customer: boolean;
  discount: boolean;
  shipDate: boolean;
  orderDate: boolean;
  orderId: boolean;
  quantity: boolean;
  region: boolean;
  category: boolean;
  product: boolean;
};

function words(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Singular and plural spellings of one alias.
 *
 * `missingInformation()`'s `asksFor` patterns accept plural phrasing, so a file
 * whose column is `Discounts` was asked about happily and then reported as not
 * carrying discount information — the question was allowed by one half of the
 * guardrail and refused by the other. Matching both spellings makes the two
 * halves agree. (Two gates over one artifact, derived from different evidence,
 * is the same shape as the prep-gate bug in `tasks/lessons.md` 2026-07-26.)
 */
function spellings(alias: string): string[] {
  const forms = new Set([alias]);

  // consonant + y -> ies. Without this `category` pluralised to `categorys`
  // and a file with a `Categories` column was still reported as lacking it —
  // the exact class of bug this helper was added to close.
  if (/[^aeiou]y$/.test(alias)) forms.add(`${alias.slice(0, -1)}ies`);
  else if (/(?:s|x|z|ch|sh)$/.test(alias)) forms.add(`${alias}es`);
  else forms.add(`${alias}s`);

  // ...and the same walk backwards, so a plural alias still matches a
  // singular column name.
  if (alias.endsWith("ies")) forms.add(`${alias.slice(0, -3)}y`);
  else if (/(?:s|x|z|ch|sh)es$/.test(alias)) forms.add(alias.slice(0, -2));
  else if (alias.endsWith("s")) forms.add(alias.slice(0, -1));

  return [...forms];
}

function availableInformation(profile: DatasetProfile): AvailableInformation {
  const fields = profile.columns.map((column) => new Set(words(column.name)));
  const hasWord = (...aliases: string[]) =>
    fields.some((field) =>
      aliases.some((alias) => spellings(alias).some((form) => field.has(form))),
    );
  const hasWords = (...required: string[]) =>
    fields.some((field) => required.every((word) => field.has(word)));

  return {
    sales: hasWord("sales", "revenue", "turnover"),
    profit: hasWord("profit", "earnings", "income"),
    cost: hasWord("cost", "costs", "cogs", "expense", "expenses"),
    margin: hasWord("margin"),
    customer: hasWord("customer", "client", "buyer"),
    discount: hasWord("discount", "markdown"),
    shipDate:
      hasWords("ship", "date") ||
      hasWords("shipping", "date") ||
      hasWords("delivery", "date"),
    orderDate: hasWords("order", "date") || hasWords("purchase", "date"),
    orderId:
      hasWords("order", "id") ||
      hasWords("order", "number") ||
      hasWords("order", "no"),
    quantity: hasWord("quantity", "units"),
    region: hasWord("region", "territory"),
    category: hasWord("category"),
    product: hasWord("product", "item", "sku"),
  };
}

function refusal(
  category: RefusalCategory,
  detail: string,
): Extract<GuardrailDecision, { allowed: false }> {
  return { allowed: false, category, detail };
}

/**
 * Every singular a plural might have come from, because English does not let you
 * pick one: "movies" and "countries" both end in "ies", and only one of them is
 * a "y" word. Both candidates are offered and a match on any of them counts.
 */
function variants(word: string): string[] {
  const forms = new Set([word]);
  if (word.length > 4 && word.endsWith("ies")) {
    forms.add(`${word.slice(0, -3)}y`);
  }
  if (word.length > 4 && word.endsWith("es")) forms.add(word.slice(0, -2));
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    forms.add(word.slice(0, -1));
  }
  return [...forms];
}

/**
 * Everything this file demonstrably talks about: the words in its column names,
 * and the words in the values of its own categories and labels — so "movies" is
 * recognised on a file whose `type` column contains "Movie", not just on one
 * with a column called movie.
 *
 * The synonyms of any business concept the file provably has are folded in too,
 * so a file with `Sales` still answers a question phrased as "revenue".
 */
function fileVocabulary(profile: DatasetProfile): Set<string> {
  const vocabulary = new Set<string>();
  const add = (word: string): void => {
    if (word.length < 2) return;
    for (const form of variants(word)) vocabulary.add(form);
  };

  for (const column of profile.columns) {
    for (const word of words(column.name)) add(word);
    if (
      column.kind === "category" ||
      column.kind === "text" ||
      column.kind === "id"
    ) {
      for (const value of column.sampleValues) {
        for (const word of words(value)) add(word);
      }
    }
  }

  const available = availableInformation(profile);
  const synonyms: ReadonlyArray<[keyof AvailableInformation, string[]]> = [
    ["sales", ["sales", "revenue", "turnover"]],
    ["profit", ["profit", "earnings", "income"]],
    ["cost", ["cost", "costs", "cogs", "expense", "expenses"]],
    ["margin", ["margin", "margins"]],
    ["customer", ["customer", "customers", "client", "clients", "buyer"]],
    ["discount", ["discount", "discounts", "markdown"]],
    ["quantity", ["quantity", "units", "unit"]],
    ["region", ["region", "regions", "territory", "territories"]],
    ["category", ["category", "categories"]],
    ["product", ["product", "products", "item", "items", "sku"]],
    ["orderId", ["order", "orders"]],
  ];
  for (const [concept, aliases] of synonyms) {
    if (available[concept]) for (const alias of aliases) add(alias);
  }

  return vocabulary;
}

/**
 * Words that are about the file itself or about the shape of the arithmetic,
 * never about a subject the file would have to record. A question containing
 * one of these is a question about the data as data, and is always fair game.
 */
const META_WORDS = new Set([
  "record",
  "records",
  "row",
  "rows",
  "entry",
  "entries",
  "line",
  "lines",
  "file",
  "files",
  "dataset",
  "data",
  "column",
  "columns",
  "field",
  "fields",
  "value",
  "values",
  "duplicate",
  "duplicates",
  "thing",
  "things",
  // "How many types are represented?" asks about the shape of the data, not
  // about a subject the file would have to record.
  "type",
  "types",
  "kind",
  "kinds",
]);

/** Modifiers that sit between "how many" and the actual subject. */
const MODIFIERS = new Set([
  "exact",
  "unique",
  "distinct",
  "different",
  "separate",
  "total",
  "average",
  "median",
  "individual",
  "of",
  "the",
  "a",
  "an",
  "more",
  "other",
  // Determiners and possessives: "how many of these are duplicates?" counts
  // duplicates, not "these". Before the subject phrase was isolated these were
  // harmless — now they would be mistaken for the subject itself.
  "this",
  "that",
  "these",
  "those",
  "each",
  "every",
  "any",
  "all",
  "our",
  "my",
  "your",
  "their",
  "its",
]);

/**
 * Where the counted noun phrase stops.
 *
 * Everything from the first verb or preposition onward says where to look, not
 * what is being counted: "how many directors are in this dataset" counts
 * directors, and "in this dataset" is scenery. Reading the whole sentence as
 * the subject is what let one meta word ("dataset") and one recognised
 * qualifier ("by country") each excuse a subject the file never records.
 */
const SUBJECT_END = new Set([
  "is",
  "are",
  "was",
  "were",
  "do",
  "does",
  "did",
  "has",
  "have",
  "had",
  "there",
  "in",
  "on",
  "at",
  "by",
  "for",
  "from",
  "with",
  "per",
  "to",
  "into",
  "over",
  "under",
  "about",
  "than",
  "across",
  "between",
  "during",
  "within",
  "among",
  "we",
  "i",
  "you",
  "they",
  "it",
  "which",
  "and",
  "or",
]);

/**
 * "How many X" and "how much X" name the subject being counted outright — the
 * one place a question is unambiguous enough to refuse on. Anything looser
 * ("which project had the highest sales?") stays allowed on purpose: a false
 * refusal hides a valid analysis, and execution is still the final arbiter.
 */
function unrecordedSubject(
  question: string,
  profile: DatasetProfile,
): GuardrailDecision | null {
  const match = /\bhow\s+(?:many|much)\s+([a-z][a-z\s-]*)/i.exec(question);
  if (!match?.[1]) return null;

  /*
   * Both halves below judge the COUNTED SUBJECT, never the whole sentence.
   * Judging the sentence meant any meta word anywhere returned early ("how many
   * directors are in this dataset?" was excused by "dataset") and any
   * recognised word anywhere counted as recognition ("how many directors are
   * there by country?" was excused by "country") — the guardrail answered a
   * question it had never actually asked.
   */
  const phrase: string[] = [];
  for (const word of words(match[1])) {
    // A SUBJECT_END word ends the noun phrase — but only once there IS one.
    // `words()` splits on the hyphen, so "how many in-store purchases are
    // there?" opened with the preposition "in", broke immediately, left the
    // phrase empty and let the question through without ever looking at
    // "purchases". Before the subject starts, these words are skipped rather
    // than treated as its end.
    if (SUBJECT_END.has(word)) {
      if (phrase.length === 0) continue;
      break;
    }
    if (MODIFIERS.has(word)) continue;
    phrase.push(word);
  }
  if (phrase.length === 0) return null;

  // A question about the data as data is always fair game.
  if (phrase.some((word) => META_WORDS.has(word))) return null;

  const vocabulary = fileVocabulary(profile);
  const recognised = phrase.some((word) =>
    variants(word).some((form) => vocabulary.has(form)),
  );
  if (recognised) return null;

  return refusal(
    "missing_information",
    `This file does not record ${phrase[0]}.`,
  );
}

function missingInformation(question: string, profile: DatasetProfile): GuardrailDecision | null {
  const available = availableInformation(profile);
  const marginAvailable =
    available.margin ||
    (available.profit && available.sales) ||
    (available.sales && available.cost);

  const requirements: ReadonlyArray<{
    asksFor: RegExp;
    available: boolean;
    label: string;
  }> = [
    {
      asksFor: /\b(?:gross\s+|net\s+|profit\s+|operating\s+)?margins?\b/i,
      available: marginAvailable,
      label: "margin",
    },
    {
      asksFor: /\b(?:customers?|clients?|buyers?)\b/i,
      available: available.customer,
      label: "customers",
    },
    {
      asksFor: /\b(?:discounts?|markdowns?)\b/i,
      available: available.discount,
      label: "discounts",
    },
    {
      asksFor: /\b(?:shipping|shipped|delivery)\b.*\b(?:delay|late|days?\s+after|how\s+long)\b/i,
      available: available.shipDate && available.orderDate,
      label: "shipping time",
    },
    {
      asksFor: /\b(?:sales|revenue|turnover)\b/i,
      available: available.sales,
      label: "sales",
    },
    {
      asksFor: /\b(?:profit(?!\s+margins?\b)|earnings|net\s+income)\b/i,
      available: available.profit,
      label: "profit",
    },
    {
      asksFor: /\b(?:costs?|cogs|expenses?)\b/i,
      available: available.cost,
      label: "costs",
    },
    {
      asksFor: /\b(?:quantity|units?)\b/i,
      available: available.quantity,
      label: "quantity",
    },
    {
      asksFor: /\b(?:regions?|territories)\b/i,
      available: available.region,
      label: "regions",
    },
    {
      asksFor: /\b(?:categories|category|sub-categories|sub-category)\b/i,
      available: available.category,
      label: "categories",
    },
    {
      asksFor: /\b(?:products?|items?|skus?)\b/i,
      available: available.product,
      label: "products",
    },
    {
      asksFor: /\b(?:unique|distinct)\s+orders?\b/i,
      available: available.orderId,
      label: "unique orders",
    },
  ];

  const missing = requirements.find(
    (requirement) => requirement.asksFor.test(question) && !requirement.available,
  );
  if (!missing) return null;

  return refusal(
    "missing_information",
    `This file does not include enough information to calculate ${missing.label}.`,
  );
}

/**
 * Conservative preflight for questions that cannot produce an honest result.
 *
 * Ambiguous wording is deliberately allowed through: execution and grounding
 * remain the final gate, while a false refusal would hide a valid analysis.
 */
export function classifyQuestion(
  question: string,
  profile: DatasetProfile,
): GuardrailDecision {
  const normalized = question.trim().replace(/\s+/g, " ");

  if (
    /\b(?:just\s+estimate|rough\s+(?:figure|number|estimate)|guess(?:\s+if\s+you\s+have\s+to)?|make\s+up\s+(?:a\s+)?number)\b/i.test(
      normalized,
    )
  ) {
    return refusal(
      "ungrounded_number",
      "A guess would not be traceable to this file, so Vera will not provide one.",
    );
  }

  if (
    /^(?:hi|hello|hey|how are you)[!.?\s]*$/i.test(normalized) ||
    /\bwho are you\b/i.test(normalized) ||
    /\b(?:tell|make)\s+(?:me\s+)?(?:a\s+)?joke\b/i.test(normalized) ||
    /\bcapital of\b/i.test(normalized) ||
    /\b(?:weather|current events?|news today|latest news|president of)\b/i.test(normalized)
  ) {
    return refusal(
      "not_about_dataset",
      "That question is not about the information in this file.",
    );
  }

  if (
    /^(?:why)\b/i.test(normalized) ||
    /\b(?:what\s+caused|caused?|causing|because|reason\s+for)\b/i.test(normalized)
  ) {
    return refusal(
      "not_computable",
      "This file can show what happened, but it cannot establish why it happened.",
    );
  }

  if (
    /\bwill\b/i.test(normalized) ||
    /^(?:please\s+)?(?:forecast|predict|project)\b/i.test(normalized) ||
    /\b(?:can|could|would)\s+you\s+(?:forecast|predict|project)\b/i.test(normalized)
  ) {
    return refusal(
      "not_computable",
      "This file contains recorded results, so it cannot support a prediction about what will happen.",
    );
  }

  if (
    /\b(?:should|recommend|recommendation|your opinion|do you think)\b/i.test(normalized)
  ) {
    return refusal(
      "not_computable",
      "That asks for a judgment. Vera can calculate what happened in this file, but she cannot make that decision.",
    );
  }

  return (
    missingInformation(normalized, profile) ??
    unrecordedSubject(normalized, profile) ?? { allowed: true }
  );
}
