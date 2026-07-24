// PLACEHOLDER — owned by the data agent.
// Minimal stand-in so the UI slice compiles and the demo path is never empty.
// The data agent's version of this file wins on merge; do not build on top of it.

export const DEMO_CSV = `month,revenue,cogs,region
2025-06,"$118,400",61200,EMEA
2025-07,"$124,900",70100,EMEA
2025-08,131200,78400,EMEA
2025-09,"$127,650",76900,EMEA
2025-10,140300,81250,EMEA
`;

export const DEMO_QUESTIONS: string[] = [
  "What was gross margin in Q3 2025?",
  "Which month had the highest revenue?",
  "How much did COGS grow from June to October?",
];
