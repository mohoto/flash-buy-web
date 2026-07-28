import OpenAI from "openai";
import { config } from "./config.js";

// Passe par OpenRouter (API compatible OpenAI), pas l'API Anthropic directe
// — permet de changer de modèle/provider via RAPID_INTENT_MODEL sans
// toucher au code.
const client = new OpenAI({
  apiKey: config.openRouterApiKey,
  baseURL: config.openRouterBaseUrl,
});

export type BatchComment = { id: string; text: string };
export type ClassifiedComment = { id: string; isPurchaseIntent: boolean };

const SYSTEM_PROMPT = `Tu analyses des commentaires postés pendant un live TikTok de vente.
Pour chaque commentaire, indique s'il exprime une NOUVELLE intention d'achat
(le buyer veut commander/réserver/prendre l'article actuellement en vente
maintenant), quelle que soit la formulation, l'orthographe ou la politesse
employée.

Ignore complètement la couleur, la taille et la quantité mentionnées : ces
détails n'ont aucune importance pour cette tâche, seule l'existence d'une
intention d'achat compte.

SONT des intentions d'achat, même SANS verbe explicite ("je prends", "jp",
"commande") et même avec une formule de politesse ("stp", "svp", "merci") :
- Une simple énumération de couleurs/variantes de l'article en vente,
  écrite spontanément par le buyer, affirmative (pas une question) (ex:
  "une kaki eh une bleu jean", "la rouge et la noire", "kaki + beige",
  "choco et fushia stp") — c'est la façon la plus courante de commander en
  live selling : citer les variantes voulues suffit, le verbe "je prends"
  est sous-entendu. La présence de "stp"/"svp"/"merci" à la fin NE change
  PAS ce diagnostic — ce n'est jamais un signal de question à elle seule,
  seule la présence d'un vrai marqueur interrogatif (point d'interrogation,
  "tu peux", "il te reste", "ça se prend en...", "pour X" désignant un
  tiers) fait basculer en question.
- Toute phrase contenant le mot-clé "jp" (abréviation de "je prends"),
  même suivi uniquement de couleurs/variantes et sans autre verbe (ex: "Jp
  saumon et bleu clair top", "Jp le haut noir") — "jp" est LE signal
  d'intention par défaut de ce live, ne le sous-évalue jamais à cause du
  reste de la phrase (le mot "top" ici désigne le vêtement, pas une
  exclamation).

NE SONT PAS des intentions d'achat (réponds false pour ces cas) :
- Une confirmation qu'un paiement a DÉJÀ été effectué (ex: "c'est payé",
  "payé pour ma part", "j'ai payé", "réglé") — c'est un accusé de paiement
  après coup, pas une nouvelle intention.
- Une déclaration de possession DÉJÀ acquise, pas une nouvelle commande (ex:
  "moi je l'ai", "je l'ai déjà", "j'en ai une") — le buyer dit qu'il possède
  déjà l'article, il n'en redemande pas.
- Une référence de commande, un numéro, ou un montant isolé sans verbe
  d'intention (ex: "539", "532 10€", "réf 12").
- Une réponse/confirmation courte SANS variante ni article cité, qui répond
  probablement à une question du vendeur ou d'un autre spectateur plutôt que
  de nommer ce qu'on veut acheter (ex: "Oui stp", "oui", "ok", "d'accord",
  "exact") — à distinguer de l'énumération de couleurs/variantes ci-dessus :
  ici il n'y a AUCUN nom de couleur/variante/article, seulement un mot
  d'acquiescement, donc pas assez pour être une intention. "stp"/"svp" seuls
  après un "oui" ne suffisent pas à en faire une commande.
- Une VRAIE question sur la disponibilité, l'essayage, ou une taille pour
  quelqu'un d'autre — reconnaissable à un marqueur interrogatif explicite,
  PAS au simple "stp"/"svp" final (ex: "tu peux essayer en L stp ?", "il te
  reste d'autre... ?", "ta réf que X prend").
- Une conversation entre spectateurs qui ne concerne pas directement le
  buyer qui écrit (ex: relayer une demande pour une tierce personne).
- Un simple salut, une question sur le prix ou la livraison, un compliment.

Si tu hésites entre "confirmation de paiement" et "nouvelle intention",
privilégie "pas une intention d'achat" (false) — un faux négatif est
préférable à un faux positif ici : le vendeur perd un ordre non-détecté,
mais un faux positif pollue son flux avec des commandes fantômes.`;

const CLASSIFY_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "classify_purchase_intents",
    description:
      "Classify each numbered comment as a purchase intent (the buyer wants to order/reserve the item currently being sold) or not.",
    parameters: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "The comment id, copied exactly from the input list." },
              is_purchase_intent: { type: "boolean" },
            },
            required: ["id", "is_purchase_intent"],
            additionalProperties: false,
          },
        },
      },
      required: ["results"],
      additionalProperties: false,
    },
    strict: true,
  },
};

function renderBatchPrompt(comments: BatchComment[]): string {
  const lines = comments.map((c) => `[id: ${c.id}] ${c.text}`).join("\n");
  return `Voici une liste de commentaires postés pendant un live de vente. Pour chaque commentaire, indique s'il exprime une intention d'achat.\n\n${lines}`;
}

function parseClassificationResponse(
  response: OpenAI.Chat.Completions.ChatCompletion,
  requestedIds: Set<string>
): ClassifiedComment[] {
  const toolCall = response.choices[0]?.message?.tool_calls?.find(
    (t) => t.type === "function" && t.function.name === "classify_purchase_intents"
  );
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("no classify_purchase_intents tool call in response");
  }

  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error("malformed tool call arguments: not valid JSON");
  }

  const input = parsedArgs as { results?: unknown };
  if (!Array.isArray(input.results)) throw new Error("malformed tool input: results is not an array");

  const seen = new Set<string>();
  const out: ClassifiedComment[] = [];
  for (const raw of input.results) {
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof (raw as Record<string, unknown>).id !== "string" ||
      typeof (raw as Record<string, unknown>).is_purchase_intent !== "boolean"
    ) {
      continue; // entrée malformée : ignorée, ne fait pas échouer tout le lot
    }
    const id = (raw as Record<string, unknown>).id as string;
    if (!requestedIds.has(id) || seen.has(id)) continue; // id halluciné/dupliqué : ignoré
    seen.add(id);
    out.push({ id, isPurchaseIntent: (raw as Record<string, unknown>).is_purchase_intent as boolean });
  }

  // Réponse jugée trop incomplète (moins de la moitié des ids demandés) :
  // déclenche un nouveau tick plutôt qu'un sous-traitement silencieux du lot.
  if (out.length < requestedIds.size / 2) {
    throw new Error(
      `classification response too incomplete: got ${out.length} of ${requestedIds.size} requested ids`
    );
  }

  return out;
}

// Classifie un lot de commentaires en un seul appel LLM (via OpenRouter) :
// soit réussit avec un jeu d'ids validés (voir parseClassificationResponse),
// soit lève une exception — jamais de résultat partiel "au mieux". C'est
// l'appelant (worker/src/rapid-batch-queue.ts) qui décide quoi faire des ids
// jamais retournés (ils restent en file, retentés au tick suivant).
export async function classifyPurchaseIntents(
  comments: BatchComment[]
): Promise<ClassifiedComment[]> {
  const requestedIds = new Set(comments.map((c) => c.id));

  const response = await client.chat.completions.create({
    model: config.rapidIntentModel,
    max_tokens: 4096,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: renderBatchPrompt(comments) },
    ],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "function", function: { name: "classify_purchase_intents" } },
  });

  return parseClassificationResponse(response, requestedIds);
}
