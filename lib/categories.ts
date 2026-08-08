export type CategoryId =
  | "q-fin.CP"
  | "q-fin.EC"
  | "q-fin.GN"
  | "q-fin.MF"
  | "q-fin.PM"
  | "q-fin.PR"
  | "q-fin.RM"
  | "q-fin.ST"
  | "q-fin.TR";

export interface Category {
  id: CategoryId;
  code: string;
  name: string;
  blurb: string;
  accent: string;
}

/** The nine q-fin subject classes listed on https://arxiv.org/archive/q-fin */
export const CATEGORIES: Category[] = [
  {
    id: "q-fin.CP",
    code: "CP",
    name: "Computational Finance",
    blurb:
      "Monte Carlo, PDE, lattice and other numerical methods applied to financial modeling.",
    accent: "#38bdf8",
  },
  {
    id: "q-fin.EC",
    code: "EC",
    name: "Economics",
    blurb:
      "Micro and macro economics, international economics, theory of the firm, labor economics.",
    accent: "#a78bfa",
  },
  {
    id: "q-fin.GN",
    code: "GN",
    name: "General Finance",
    blurb:
      "Development of general quantitative methodologies with applications in finance.",
    accent: "#22d3ee",
  },
  {
    id: "q-fin.MF",
    code: "MF",
    name: "Mathematical Finance",
    blurb:
      "Stochastic, probabilistic and functional analysis, algebraic and geometric methods.",
    accent: "#f472b6",
  },
  {
    id: "q-fin.PM",
    code: "PM",
    name: "Portfolio Management",
    blurb:
      "Security selection and optimization, capital allocation, strategies, performance measurement.",
    accent: "#34d399",
  },
  {
    id: "q-fin.PR",
    code: "PR",
    name: "Pricing of Securities",
    blurb:
      "Valuation and hedging of financial securities, derivatives and structured products.",
    accent: "#fbbf24",
  },
  {
    id: "q-fin.RM",
    code: "RM",
    name: "Risk Management",
    blurb:
      "Measurement and management of financial risk in trading, banking, insurance and corporates.",
    accent: "#fb7185",
  },
  {
    id: "q-fin.ST",
    code: "ST",
    name: "Statistical Finance",
    blurb:
      "Statistical, econometric and econophysics analyses of financial markets and economic data.",
    accent: "#818cf8",
  },
  {
    id: "q-fin.TR",
    code: "TR",
    name: "Trading & Market Microstructure",
    blurb:
      "Microstructure, liquidity, exchange and auction design, automated trading, market making.",
    accent: "#4ade80",
  },
];

export const CATEGORY_MAP = new Map<string, Category>(
  CATEGORIES.map((c) => [c.id, c]),
);

export function categoryLabel(id: string): string {
  return CATEGORY_MAP.get(id)?.name ?? id;
}

export function categoryAccent(id: string): string {
  return CATEGORY_MAP.get(id)?.accent ?? "#94a3b8";
}
