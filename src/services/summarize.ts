function getTextContent(value: unknown): string | null {
    if (typeof value === "string") {
        return value.trim();
    }

    if (!Array.isArray(value)) {
        return null;
    }

    const text = value
        .map((item) => {
            if (typeof item === "string") {
                return item;
            }

            if (item && typeof item === "object" && "text" in item) {
                return getTextContent((item as { text: unknown }).text);
            }

            return null;
        })
        .filter((item): item is string => Boolean(item))
        .join("");

    return text.trim() || null;
}
function extractAiText(response: unknown): string {
    const directText = getTextContent(response);
    if (directText) {
        return directText;
    }

    if (!response || typeof response !== "object") {
        throw new Error("AI response did not include text content.");
    }

    const data = response as {
        response?: unknown;
        output_text?: unknown;
        result?: { response?: unknown };
        choices?: Array<{
            text?: unknown;
            message?: {
                content?: unknown;
            };
            finish_reason?: string | null;
        }>;
    };

    const text =
        getTextContent(data.response) ??
        getTextContent(data.output_text) ??
        getTextContent(data.result?.response) ??
        getTextContent(data.choices?.[0]?.message?.content) ??
        getTextContent(data.choices?.[0]?.text);

    if (text) {
        return text;
    }

    const finishReason = data.choices?.[0]?.finish_reason;
    throw new Error(
        `AI response did not include final text content${finishReason ? ` (finish_reason: ${finishReason})` : ""}.`
    );
}

function parsePostJson(rawText: string): string {
    const cleanedText = rawText
        .trim()
        .replace(/^Response:\s*/i, "")
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    const jsonText = getJsonObjectCandidate(cleanedText);
    const parsed = JSON.parse(jsonText) as { post?: unknown };

    if (typeof parsed.post !== "string" || parsed.post.trim() === "") {
        throw new Error("AI JSON response did not include a valid post string.");
    }

    return parsed.post.trim();
}

function getJsonObjectCandidate(text: string): string {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
        return text;
    }

    return text.slice(firstBrace, lastBrace + 1);
}

const SUMMARY_MODEL = "@cf/google/gemma-4-26b-a4b-it" as keyof AiModels;
const MAX_SUMMARIES_PER_RUN = 2;


async function generateSummary(ai: Ai, content: string): Promise<string> {
    const response = await ai.run(SUMMARY_MODEL, {
        messages: [
            {
                role: "system",
                content: `Role: Social Media Manager - Af-Soomaali Facebook posts only

Absolute rules - waa inaad 100% raacdaa:
- Af-Soomaali fudud oo dadweyne kaliya
- Mamnuuc: source, website, qoraa, link, emoji, bullet, number, cinwaan, related news
- Ha ku bilaabin magaalo ama dateline sida MUQDISHO.
- Ha sheegin hay'ad, warbaahin, ama qofka/qoraaga warka haddii aysan ahayn qodobka ugu muhiimsan ee dhacdada.
- Qaab: sadarro isku xiran + double newline kadib sadar kasta
- Habka: ugu muhiimsan -> faahfaahin -> gabagabo kooban
- Do not think step by step. Do not draft. Do not explain your reasoning.
- Return valid JSON only. No markdown, no code block, no explanation.
- JSON shape must be exactly: {"post":"..."}
- The post value must be one JSON string. Escape paragraph breaks as \\n\\n. Do not put raw line breaks inside the string.`,
            },
            {
                role: "user",
                content: "Warka la soo koobayo:\n " + content + "\n\nSoo koob sida kor ku xusan. Ku celi JSON object keliya.",
            },
        ],
        response_format: {
            type: "json_object",
            json_schema: {
                name: "post",
                schema: {
                    post: {
                        type: "string",
                    },
                },
            },
        },
    });

    return extractAiText(response);
}

async function summarizeArticle(ai: Ai, content: string): Promise<string> {
    try {
        const rawJson = await generateSummary(ai, content);
        return parsePostJson(rawJson);
    } catch (error) {
        throw error;
    }
}

export const SummarizeService = {
    async summarizePending(env: Env, ai: Ai) {
        const { results } = await env.DB.prepare(
            `SELECT id, title, content
             FROM news
             WHERE label='New'
               AND (post IS NULL OR post = '')
               AND content IS NOT NULL
             ORDER BY id
             LIMIT ?`
        ).bind(MAX_SUMMARIES_PER_RUN).all();

        if (results.length === 0) {
            return;
        }

        console.log(
            `Summarizing ${results.length} article(s) with ${SUMMARY_MODEL}`
        );

        for (const row of results) {
            try {
                const post = await summarizeArticle(ai, row.content as string);
                await env.DB.prepare(
                    "UPDATE news SET post = ?, processed = 1 WHERE id = ?"
                ).bind(post, row.id).run();

                console.log(`Summarized article ${row.id}`);
            } catch (err) {
                console.error(`Failed to summarize article ${row.id}:`, err);
            }
        }
    },
};
