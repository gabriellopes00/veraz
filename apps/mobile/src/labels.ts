import type { Category, Verdict } from "@veraz/shared";

/** Portuguese wording of the definitions in @veraz/shared, which stay in English for the prompts. */
export const DEFINITION_PT: Record<Verdict, string> = {
  TRUE: "Correto e sustentado por fontes confiáveis, sem omissão relevante.",
  TRUE_BUT: "Correto ao pé da letra, mas falta uma ressalva ou um contexto que muda a leitura.",
  NOT_QUITE: "Em parte certo, mas um detalhe (quem, quando, onde, como) está errado ou impreciso.",
  EXAGGERATED: "Vai na direção certa, mas o tamanho, a frequência ou a intensidade foi inflado.",
  UNDERSTATED: "Vai na direção certa, mas o tamanho, a frequência ou a intensidade real é maior do que o dito.",
  DISTORTED:
    "Dados ou fatos reais apresentados de forma torta: comparação errada, período escolhido a dedo, causa e efeito trocados.",
  MISLEADING:
    "Cada parte pode estar certa, mas o conjunto leva a uma conclusão falsa por omitir ou manipular o contexto.",
  FALSE: "Desmentido por fontes confiáveis ou por fatos estabelecidos.",
  NO_EVIDENCE: "Dá para checar, mas a busca não achou fonte confiável que confirme nem que desminta.",
  CONTRADICTORY: "Contradiz algo que a mesma pessoa ou a própria conversa disse antes.",
  OUTDATED: "Já foi verdade, mas dados ou fatos mais recentes mudaram o quadro.",
  UNVERIFIABLE: "Não dá para checar em fontes públicas: é privado, subjetivo ou vago demais.",
};

export const CATEGORY_PT: Record<Category, string> = {
  politics: "Política",
  health: "Saúde",
  science: "Ciência",
  economy: "Economia",
  sports: "Esportes",
  history: "História",
  technology: "Tecnologia",
  general: "Geral",
};
