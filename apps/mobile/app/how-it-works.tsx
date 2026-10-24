import { CATEGORIES, type Category, SOURCES_BY_CATEGORY, VERDICTS, type Verdict } from "@veraz/shared";
import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { AiNotice } from "../src/components/AiNotice";
import { ChevronIcon } from "../src/components/Icons";
import { CheckingBadge, VerdictBadge } from "../src/components/VerdictBadge";
import { card, colors, continuous, font, IOS, radius, space, type } from "../src/theme";

const STEPS = [
  {
    title: "Escuta",
    body: "O microfone envia o áudio ao servidor por uma conexão que fica aberta o tempo todo. A transcrição aparece enquanto a pessoa ainda está falando.",
  },
  {
    title: "Fim da frase",
    body: "Uma pausa curta marca o fim da frase. A frase concluída segue para análise na hora, sem esperar a próxima.",
  },
  {
    title: "Identificação",
    body: "A IA lê a frase, com as anteriores como contexto, e separa o que dá para conferir: números, estatísticas, datas, eventos, leis, recordes e citações. Opiniões, piadas, perguntas e previsões ficam de fora. Cada afirmação é reescrita para fazer sentido sozinha, ganha uma categoria e já aparece na lista.",
  },
  {
    title: "Busca",
    body: "Cada afirmação é pesquisada na web, só nas fontes confiáveis da sua categoria: primeiro checagens já publicadas, depois imprensa, dados oficiais e fontes primárias. Várias afirmações são checadas ao mesmo tempo, sem atrasar a transcrição.",
  },
  {
    title: "Veredito",
    body: "A IA compara a afirmação com o que as fontes dizem (números, datas, alcance, causa e efeito) e escolhe o veredito mais preciso, com confiança, resumo, explicação e as fontes usadas.",
  },
];

/** Portuguese wording of the definitions in @veraz/shared, which stay in English for the prompts. */
const DEFINITIONS: Record<Verdict, string> = {
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

const CATEGORY_PT: Record<Category, string> = {
  politics: "Política",
  health: "Saúde",
  science: "Ciência",
  economy: "Economia",
  sports: "Esportes",
  history: "História",
  technology: "Tecnologia",
  general: "Geral",
};

// Same marks as the source rows of the claim screen.
const STANCES = [
  { icon: "✓", color: colors.success, label: "Apoia" },
  { icon: "✗", color: colors.danger, label: "Refuta" },
  { icon: "ℹ", color: colors.muted, label: "Contexto" },
];

const NOTES = [
  "Funciona em português e em inglês. O veredito e a explicação vêm no idioma da afirmação.",
  "Afirmações digitadas seguem o mesmo caminho das faladas.",
  "Se a conversa repete uma afirmação, vale só a primeira.",
  "A lixeira ao lado de Gravar encerra a conversa e cancela as checagens em andamento.",
];

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{title}</Text>
      {intro && <Text style={styles.intro}>{intro}</Text>}
      {children}
    </View>
  );
}

/** One row of a card; every row after the first gets a hairline above it. */
function Row({ first, children }: { first: boolean; children: ReactNode }) {
  return <View style={[styles.row, !first && styles.divider]}>{children}</View>;
}

/** A category and its domain count; tap to list the domains. */
function CategoryRow({ category, first }: { category: Category; first: boolean }) {
  const [open, setOpen] = useState(false);
  const domains = [...new Set(SOURCES_BY_CATEGORY[category])];
  return (
    <View style={!first && styles.divider}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.row, styles.categoryHead, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.title, styles.flex]}>{CATEGORY_PT[category]}</Text>
        <Text style={styles.meta}>{domains.length} fontes</Text>
        <View style={open && styles.down}>
          <ChevronIcon size={18} color={colors.muted} />
        </View>
      </Pressable>
      {open && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.domains}>
          {domains.map((d) => (
            <View key={d} style={styles.domain}>
              <Text style={styles.domainText}>{d}</Text>
            </View>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

export default function HowItWorks() {
  return (
    // "automatic" insets the content below the transparent Liquid Glass header on iOS 26.
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body}>
      <Text style={styles.headline}>Da fala ao veredito, em segundos</Text>
      <Text style={styles.lead}>
        O Veraz escuta a conversa, separa o que dá para conferir e checa cada afirmação na web enquanto a conversa
        continua. Transcrever e identificar vêm primeiro; a checagem corre em paralelo e nunca atrasa o resto.
      </Text>
      <View style={styles.notice}>
        <AiNotice />
      </View>

      <Section title="O caminho de uma afirmação">
        <View style={card}>
          {STEPS.map((s, i) => (
            <Row key={s.title} first={i === 0}>
              <View style={styles.step}>
                <Text style={styles.stepNumber}>{i + 1}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.title}>{s.title}</Text>
                <Text style={styles.text}>{s.body}</Text>
              </View>
            </Row>
          ))}
        </View>
      </Section>

      <Section title="Estados" intro="Cada card mostra em que ponto a checagem está.">
        <View style={card}>
          <Row first>
            <View style={styles.stacked}>
              <CheckingBadge />
              <Text style={styles.text}>
                A afirmação foi identificada e está sendo checada. O card aparece antes do veredito, para você
                acompanhar.
              </Text>
            </View>
          </Row>
          <Row first={false}>
            <View style={styles.stacked}>
              <VerdictBadge verdict="TRUE" lang="pt" />
              <Text style={styles.text}>
                Checagem concluída. Toque no card para ver a confiança, a explicação e as fontes.
              </Text>
            </View>
          </Row>
          <Row first={false}>
            <View style={styles.stacked}>
              <Text style={styles.error}>Erro na verificação</Text>
              <Text style={styles.text}>
                A busca falhou ou demorou demais. A afirmação continua na lista, sem veredito.
              </Text>
            </View>
          </Row>
          <Row first={false}>
            <View style={styles.stacked}>
              <Text style={styles.meta}>3 fontes · cache</Text>
              <Text style={styles.text}>
                A mesma afirmação foi checada há pouco, então o veredito é reaproveitado na hora, sem nova busca.
              </Text>
            </View>
          </Row>
        </View>
      </Section>

      <Section
        title={`Vereditos (${VERDICTS.length})`}
        intro="Cada veredito vem com uma confiança de 0 a 100%. Ela cai quando há poucas fontes, quando são antigas ou quando discordam entre si."
      >
        <View style={card}>
          {VERDICTS.map((v, i) => (
            <Row key={v} first={i === 0}>
              <View style={styles.stacked}>
                <VerdictBadge verdict={v} lang="pt" />
                <Text style={styles.text}>{DEFINITIONS[v]}</Text>
              </View>
            </Row>
          ))}
        </View>
      </Section>

      <Section
        title="Fontes por categoria"
        intro="A busca fica restrita a sites confiáveis, escolhidos pela categoria da afirmação, e inclui os subdomínios de cada um. Só aparecem fontes que vieram de um resultado real da busca: a IA não pode inventar links. Se nenhuma sobra, o veredito vira Não verificável."
      >
        <View style={styles.stances}>
          {STANCES.map((s) => (
            <View key={s.label} style={styles.stance}>
              <Text style={[styles.stanceIcon, { color: s.color }]}>{s.icon}</Text>
              <Text style={styles.meta}>{s.label}</Text>
            </View>
          ))}
        </View>
        <View style={[card, styles.clip]}>
          {CATEGORIES.map((c, i) => (
            <CategoryRow key={c} category={c} first={i === 0} />
          ))}
        </View>
      </Section>

      <Section title="Bom saber">
        <View style={styles.notes}>
          {NOTES.map((n) => (
            <View key={n} style={styles.note}>
              <View style={styles.bullet} />
              <Text style={[styles.text, styles.flex]}>{n}</Text>
            </View>
          ))}
        </View>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: space.md, paddingBottom: space.xxl, gap: space.sm },
  headline: { ...type.titleLg, color: colors.onDark },
  lead: { ...type.bodyMd, color: colors.body },
  notice: { marginTop: space.xs },
  section: { marginTop: space.lg, gap: space.sm },
  label: { ...type.captionUpper, color: colors.muted },
  intro: { ...type.bodySm, color: colors.muted },
  row: { flexDirection: "row", gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  pressed: { backgroundColor: colors.surfaceElevated },
  title: { ...type.titleSm, color: colors.onDark },
  text: { ...type.bodySm, color: colors.body },
  meta: { ...type.caption, color: colors.muted },
  error: { ...type.caption, color: colors.danger },
  step: {
    ...continuous,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -2,
  },
  stepNumber: { ...type.caption, ...font("600"), color: colors.primary },
  stacked: { flex: 1, gap: space.xs },
  stances: { flexDirection: "row", gap: space.md },
  stance: { flexDirection: "row", alignItems: "center", gap: 6 },
  stanceIcon: { fontSize: 16, width: 18, textAlign: "center" },
  clip: { overflow: "hidden" },
  categoryHead: { alignItems: "center" },
  down: { transform: [{ rotate: "90deg" }] },
  domains: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  domain: {
    ...continuous,
    backgroundColor: colors.surfaceElevated,
    borderRadius: IOS ? radius.pill : radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  domainText: { ...type.caption, fontSize: 12, color: colors.bodyStrong },
  notes: { gap: space.xs },
  note: { flexDirection: "row", gap: space.sm },
  bullet: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.primary, marginTop: 8 },
});
