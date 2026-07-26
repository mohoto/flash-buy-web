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
Pour chaque commentaire, indique s'il exprime une intention d'achat (le
buyer veut commander/réserver/prendre l'article actuellement en vente),
quelle que soit la formulation, l'orthographe ou la politesse employée.

Ignore complètement la couleur, la taille et la quantité mentionnées : ces
détails n'ont aucune importance pour cette tâche, seule l'existence d'une
intention d'achat compte.

Un simple salut, une question sur le prix ou la livraison, un compliment,
ou tout commentaire qui n'exprime pas la volonté de prendre l'article
n'est PAS une intention d'achat.`;

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
