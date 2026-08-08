/**
 * Extractive summarizer for arXiv abstracts.
 *
 * No external model needed: sentences are scored on term frequency, position,
 * and rhetorical cues that mark contribution/result statements in papers.
 */

const STOP_WORDS = new Set(
  `a about above after again against all am an and any are as at be because been before being below between both but by can cannot could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself me more most my myself no nor not of off on once only or other ought our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why with would you your yours yourself yourselves also using used use based show shows shown paper study new via within across per given however thus therefore among may might one two three first second`
    .split(/\s+/)
    .filter(Boolean),
);

/** Phrases that typically introduce the contribution or the result. */
const CUE_PATTERNS: Array<{ re: RegExp; weight: number }> = [
  { re: /\bwe (propose|introduce|develop|present|construct|derive)\b/i, weight: 3.2 },
  { re: /\bwe (show|find|prove|demonstrate|establish|document)\b/i, weight: 3.0 },
  { re: /\bthis (paper|study|article|work)\b/i, weight: 2.2 },
  { re: /\b(our|the) (results?|findings?|framework|approach|model|method)\b/i, weight: 1.8 },
  { re: /\b(outperform|improv\w+|reduc\w+|increas\w+|gain\w*|superior)\b/i, weight: 1.6 },
  { re: /\b(empirical|evidence|experiments?|backtest\w*|out-of-sample)\b/i, weight: 1.5 },
  { re: /\b(we contribute|contribution)\b/i, weight: 1.4 },
];

/** Domain terms worth surfacing as topic chips, with display labels. */
const DOMAIN_TERMS: Array<[term: string, label: string]> = [
  ["volatility", "Volatility"],
  ["rough volatility", "Rough Volatility"],
  ["liquidity", "Liquidity"],
  ["portfolio", "Portfolio"],
  ["hedging", "Hedging"],
  ["arbitrage", "Arbitrage"],
  ["derivatives", "Derivatives"],
  ["options?", "Options"],
  ["futures", "Futures"],
  ["optimal execution", "Optimal Execution"],
  ["microstructure", "Market Microstructure"],
  ["order book", "Order Book"],
  ["limit order", "Limit Order"],
  ["market[- ]making", "Market Making"],
  ["risk", "Risk"],
  ["tail risk", "Tail Risk"],
  ["systemic risk", "Systemic Risk"],
  ["value[- ]at[- ]risk|\\bVaR\\b", "Value-at-Risk"],
  ["expected shortfall", "Expected Shortfall"],
  ["drawdown", "Drawdown"],
  ["credit risk", "Credit Risk"],
  ["default", "Default"],
  ["contagion", "Contagion"],
  ["stochastic", "Stochastic Models"],
  ["monte carlo", "Monte Carlo"],
  ["neural networks?", "Neural Networks"],
  ["deep learning", "Deep Learning"],
  ["machine learning", "Machine Learning"],
  ["reinforcement learning", "Reinforcement Learning"],
  ["transformers?", "Transformers"],
  ["\\bLLMs?\\b|large language models?", "LLMs"],
  ["bayesian", "Bayesian"],
  ["\\bGARCH\\b", "GARCH"],
  ["optimal control", "Optimal Control"],
  ["mean[- ]variance", "Mean-Variance"],
  ["factor models?", "Factor Models"],
  ["momentum", "Momentum"],
  ["asset pricing", "Asset Pricing"],
  ["term structure", "Term Structure"],
  ["interest rates?", "Interest Rates"],
  ["crypto\\w*", "Crypto"],
  ["bitcoin", "Bitcoin"],
  ["stablecoins?", "Stablecoins"],
  ["\\bDeFi\\b", "DeFi"],
  ["\\bESG\\b", "ESG"],
  ["climate", "Climate"],
  ["sentiment", "Sentiment"],
  ["high[- ]frequency", "High Frequency"],
  ["calibration", "Calibration"],
  ["copulas?", "Copulas"],
  ["insurance", "Insurance"],
  ["pension", "Pensions"],
];

const TOPIC_MATCHERS = DOMAIN_TERMS.map(([term, label]) => ({
  label,
  re: new RegExp(`(?:^|[^\\w-])(?:${term})(?:$|[^\\w-])`, "i"),
}));

/** More specific chips win when a broader one is a subset of the same phrase. */
const TOPIC_SUBSUMED: Record<string, string[]> = {
  Volatility: ["Rough Volatility"],
  Risk: ["Tail Risk", "Systemic Risk", "Credit Risk", "Value-at-Risk"],
  Options: ["Derivatives"],
};

export interface PaperSummary {
  /** 1–2 sentence gist. */
  tldr: string;
  /** Up to 3 supporting sentences, in original order. */
  highlights: string[];
  /** Detected domain topics for chips. */
  topics: string[];
  /** Estimated reading time of the full abstract, in minutes. */
  readingMinutes: number;
  wordCount: number;
}

function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  // Protect common abbreviations and decimals from naive sentence splitting.
  const guarded = cleaned
    .replace(/\b(e\.g|i\.e|et al|cf|vs|approx|Fig|Eq|Sec|Dr|Prof|No)\./gi, "$1<DOT>")
    .replace(/(\d)\.(\d)/g, "$1<DOT>$2");

  return guarded
    .split(/(?<=[.!?])\s+(?=[A-Z(“"'\\$])/)
    .map((s) => s.replace(/<DOT>/g, ".").trim())
    .filter((s) => s.length > 25);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function termFrequencies(sentences: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const sentence of sentences) {
    for (const token of tokenize(sentence)) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }
  // Normalise so long abstracts do not dominate the score.
  let max = 0;
  for (const v of freq.values()) max = Math.max(max, v);
  if (max > 0) {
    for (const [k, v] of freq) freq.set(k, v / max);
  }
  return freq;
}

function scoreSentence(
  sentence: string,
  index: number,
  total: number,
  freq: Map<string, number>,
): number {
  const tokens = tokenize(sentence);
  if (!tokens.length) return 0;

  const density = tokens.reduce((sum, t) => sum + (freq.get(t) ?? 0), 0) / tokens.length;

  // Opening sentences carry the framing; closing ones carry the takeaway.
  const relative = index / Math.max(1, total - 1);
  const position = index === 0 ? 1.5 : relative > 0.75 ? 0.9 : 0.55;

  const cue = CUE_PATTERNS.reduce(
    (sum, { re, weight }) => (re.test(sentence) ? sum + weight : sum),
    0,
  );

  // Mildly prefer mid-length sentences; very short ones rarely stand alone.
  const words = sentence.split(/\s+/).length;
  const lengthPenalty = words < 12 ? 0.6 : words > 55 ? 0.75 : 1;

  return (density * 6 + position + cue) * lengthPenalty;
}

function detectTopics(text: string): string[] {
  const found = TOPIC_MATCHERS.filter(({ re }) => re.test(text)).map((m) => m.label);
  const present = new Set(found);

  return found
    .filter((label) =>
      !(TOPIC_SUBSUMED[label] ?? []).some((specific) => present.has(specific)),
    )
    .slice(0, 6);
}

export function summarizeAbstract(abstract: string, title = ""): PaperSummary {
  const text = (abstract ?? "").replace(/\s+/g, " ").trim();
  const wordCount = text ? text.split(/\s+/).length : 0;
  const readingMinutes = Math.max(1, Math.round(wordCount / 200));

  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return {
      tldr: text.slice(0, 280),
      highlights: [],
      topics: detectTopics(`${title} ${text}`),
      readingMinutes,
      wordCount,
    };
  }

  const freq = termFrequencies(sentences);
  const scored = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: scoreSentence(sentence, index, sentences.length, freq),
  }));

  // A readable gist needs both halves of an abstract's rhetoric: the sentence
  // that frames the problem, and the sentence that states what was achieved.
  const lead = [...scored]
    .slice(0, Math.min(2, scored.length))
    .sort((a, b) => b.score - a.score)[0];

  const contribution = [...scored]
    .filter((s) => s.index !== lead.index)
    .sort((a, b) => b.score - a.score)[0];

  const tldrIndexes = new Set([lead.index]);
  if (contribution && sentences.length > 2) tldrIndexes.add(contribution.index);

  const tldr = scored
    .filter((s) => tldrIndexes.has(s.index))
    .map((s) => s.sentence)
    .join(" ");

  const highlights = [...scored]
    .filter((s) => !tldrIndexes.has(s.index))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence);

  return {
    tldr,
    highlights,
    topics: detectTopics(`${title} ${text}`),
    readingMinutes,
    wordCount,
  };
}
