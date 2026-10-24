import type { Category } from "@veraz/shared";

// Edit freely. Domains omit the protocol and include subdomains automatically.

export const FACT_CHECKERS = [
  "lupa.news",
  "aosfatos.org",
  "estadao.com.br",
  "noticias.uol.com.br",
  "checamos.afp.com",
  "projetocomprova.com.br",
  "boatos.org",
  "reuters.com",
  "snopes.com",
  "politifact.com",
  "fullfact.org",
];

export const NEWS = [
  "g1.globo.com",
  "folha.uol.com.br",
  "estadao.com.br",
  "bbc.com",
  "poder360.com.br",
  "reuters.com",
  "apnews.com",
  "agenciabrasil.ebc.com.br",
];

const OFFICIAL = [
  "ibge.gov.br",
  "gov.br",
  "bcb.gov.br",
  "tse.jus.br",
  "ipea.gov.br",
  "worldbank.org",
  "who.int",
  "un.org",
];
const SCIENCE_HEALTH = [
  "nature.com",
  "science.org",
  "pubmed.ncbi.nlm.nih.gov",
  "fiocruz.br",
  "butantan.gov.br",
  "who.int",
  "paho.org",
  "saude.gov.br",
  "cdc.gov",
  "thelancet.com",
  "nih.gov",
];

/** Category-specific domains, ordered by relevance (truncated to the tool's domain limit). */
export const SOURCES_BY_CATEGORY: Record<Category, string[]> = {
  politics: [
    ...FACT_CHECKERS,
    ...NEWS,
    "tse.jus.br",
    "camara.leg.br",
    "senado.leg.br",
    "stf.jus.br",
    "planalto.gov.br",
    "gov.br",
    "transparencia.gov.br",
    "worldbank.org",
  ],
  health: [
    ...FACT_CHECKERS,
    ...SCIENCE_HEALTH,
    "g1.globo.com",
    "folha.uol.com.br",
    "bbc.com",
    "ibge.gov.br",
    "reuters.com",
  ],
  science: [
    ...FACT_CHECKERS,
    ...SCIENCE_HEALTH,
    "nasa.gov",
    "scientificamerican.com",
    "bbc.com",
    "reuters.com",
    "g1.globo.com",
  ],
  economy: [
    ...FACT_CHECKERS,
    "ibge.gov.br",
    "bcb.gov.br",
    "ipea.gov.br",
    "tesouro.fazenda.gov.br",
    "worldbank.org",
    "imf.org",
    "oecd.org",
    ...NEWS,
    "valor.globo.com",
  ],
  sports: [
    ...FACT_CHECKERS.slice(0, 4),
    "ge.globo.com",
    "espn.com.br",
    "espn.com",
    "fifa.com",
    "cbf.com.br",
    "olympics.com",
    "uefa.com",
    "bbc.com",
    "reuters.com",
    "apnews.com",
    "lance.com.br",
  ],
  history: [
    ...FACT_CHECKERS.slice(0, 4),
    "britannica.com",
    "bbc.com",
    "nationalgeographic.com",
    "history.com",
    "smithsonianmag.com",
    "nature.com",
    "ibge.gov.br",
    "gov.br",
    "brasilescola.uol.com.br",
    "fgv.br",
  ],
  technology: [
    ...FACT_CHECKERS.slice(0, 6),
    "techcrunch.com",
    "theverge.com",
    "arstechnica.com",
    "wired.com",
    "tecnoblog.net",
    "canaltech.com.br",
    "reuters.com",
    "bbc.com",
    "g1.globo.com",
    "nature.com",
  ],
  general: [...FACT_CHECKERS, ...NEWS, ...OFFICIAL, "britannica.com"],
};

export function domainsFor(category: Category, max: number): string[] {
  return [...new Set(SOURCES_BY_CATEGORY[category])].slice(0, max);
}
