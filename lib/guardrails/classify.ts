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

function availableInformation(profile: DatasetProfile): AvailableInformation {
  const fields = profile.columns.map((column) => new Set(words(column.name)));
  const hasWord = (...aliases: string[]) =>
    fields.some((field) => aliases.some((alias) => field.has(alias)));
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

  return missingInformation(normalized, profile) ?? { allowed: true };
}
