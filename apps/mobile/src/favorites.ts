import { create } from "zustand";
import type { Claim } from "@veraz/shared";

// MOCK: favourites live in memory, seeded with the claims below, until there is an API to persist them. The rest of
// the app only goes through the hooks and functions at the bottom of this file, so swapping the source stays local.

const verified = (c: Pick<Claim, "id" | "quote" | "category"> & { result: NonNullable<Claim["result"]> }): Claim => ({
  ...c,
  claim: c.quote,
  language: "pt",
  status: "verified",
  error: null,
  cached: false,
  createdAt: 0,
});

const SEED: Claim[] = [
  verified({
    id: "fav-great-wall",
    quote: "A Muralha da China é visível do espaço a olho nu.",
    category: "science",
    result: {
      verdict: "FALSE",
      confidence: 0.95,
      summary: "Astronautas em órbita baixa relatam não conseguir distinguir a muralha sem ajuda óptica.",
      explanation:
        "A muralha é longa, mas estreita (cerca de 6 m) e da mesma cor do terreno ao redor. Fotos de órbita só a mostram com lentes de longo alcance.",
      sources: [
        { title: "Great Wall of China from space", outlet: "NASA", url: "https://www.nasa.gov", published_at: null, stance: "refutes" },
        { title: "Is the Great Wall visible from space?", outlet: "Scientific American", url: "https://www.scientificamerican.com", published_at: null, stance: "refutes" },
      ],
    },
  }),
  verified({
    id: "fav-amazon-river",
    quote: "O Rio Amazonas é o maior rio do mundo em volume de água.",
    category: "science",
    result: {
      verdict: "TRUE",
      confidence: 0.97,
      summary: "Nenhum outro rio tem vazão comparável: o Amazonas despeja mais água no oceano que os sete seguintes juntos.",
      explanation: "A vazão média na foz é de cerca de 200 mil m³/s, muito acima do Congo, o segundo colocado.",
      sources: [
        { title: "Rio Amazonas", outlet: "ANA", url: "https://www.gov.br/ana", published_at: null, stance: "supports" },
        { title: "Amazon River", outlet: "Britannica", url: "https://www.britannica.com", published_at: null, stance: "supports" },
        { title: "The world's largest rivers", outlet: "USGS", url: "https://www.usgs.gov", published_at: null, stance: "supports" },
      ],
    },
  }),
  verified({
    id: "fav-coffee",
    quote: "Depois da água, o café é a bebida mais consumida do mundo.",
    category: "general",
    result: {
      verdict: "NOT_QUITE",
      confidence: 0.8,
      summary: "Depois da água, a bebida mais consumida é o chá; o café vem logo atrás.",
      explanation: "Estimativas de consumo diário põem o chá à frente do café em número de xícaras no mundo.",
      sources: [{ title: "Tea market report", outlet: "FAO", url: "https://www.fao.org", published_at: null, stance: "refutes" }],
    },
  }),
  verified({
    id: "fav-brain",
    quote: "Nós usamos apenas 10% do nosso cérebro.",
    category: "health",
    result: {
      verdict: "FALSE",
      confidence: 0.96,
      summary: "Exames de imagem mostram atividade em praticamente todas as regiões do cérebro ao longo do dia.",
      explanation: "O mito não tem base científica; mesmo lesões pequenas em qualquer área costumam ter efeitos.",
      sources: [
        { title: "Do we only use 10% of our brains?", outlet: "Scientific American", url: "https://www.scientificamerican.com", published_at: null, stance: "refutes" },
      ],
    },
  }),
];

interface FavoritesState {
  /** Newest first. A snapshot of each claim, so it outlives the session it came from. */
  items: Claim[];
}

const useFavoritesStore = create<FavoritesState>(() => ({ items: SEED }));

export const useFavorites = () => useFavoritesStore((s) => s.items);

export const useIsFavorite = (id: string) => useFavoritesStore((s) => s.items.some((c) => c.id === id));

export const useFavorite = (id: string) => useFavoritesStore((s) => s.items.find((c) => c.id === id));

/** Only verified claims can be saved: a favourite is a checked fact to come back to. */
export function toggleFavorite(claim: Claim) {
  if (claim.status !== "verified") return;
  useFavoritesStore.setState((s) =>
    s.items.some((c) => c.id === claim.id) ? { items: s.items.filter((c) => c.id !== claim.id) } : { items: [claim, ...s.items] },
  );
}
