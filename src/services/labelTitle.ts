const DUPLICATE_LABEL_MODEL = "@cf/google/gemma-4-26b-a4b-it" as keyof AiModels;
const MAX_DUPLICATE_TITLES_PER_RUN = 10;
const MAX_REFERENCE_TITLES = 30;
const MAX_DUPLICATE_OUTPUT_TOKENS = 600;

type TitleRow = {
    id: number;
    title: string;
};

type DuplicateLabel = {
    id: number;
    label: "New" | "Duplicate";
};

function extractAiText(response: unknown): string {
    if (typeof response === "string") {
        return response.trim();
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
        }>;
    };

    const text =
        (typeof data.response === "string" && data.response) ||
        (typeof data.output_text === "string" && data.output_text) ||
        (typeof data.result?.response === "string" && data.result.response) ||
        (typeof data.choices?.[0]?.message?.content === "string" && data.choices[0].message.content) ||
        (typeof data.choices?.[0]?.text === "string" && data.choices[0].text);

    if (!text) {
        throw new Error("AI response did not include text content.");
    }

    return text.trim();
}

function getJsonObjectCandidate(text: string): string {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
        return text;
    }

    return text.slice(firstBrace, lastBrace + 1);
}

function parseDuplicateLabels(response: unknown): DuplicateLabel[] {
    const rawJson = getJsonObjectCandidate(extractAiText(response)
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim());
    const parsed = JSON.parse(rawJson) as { labels?: unknown };

    if (!Array.isArray(parsed.labels)) {
        throw new Error("AI duplicate response did not include a labels array.");
    }

    return parsed.labels.filter((item): item is DuplicateLabel => {
        return item &&
            typeof item === "object" &&
            typeof (item as { id?: unknown }).id === "number" &&
            ((item as { label?: unknown }).label === "New" ||
                (item as { label?: unknown }).label === "Duplicate");
    });
}

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ");
}

function normalizeRow(row: Record<string, unknown>): TitleRow {
    return {
        id: Number(row.id),
        title: decodeHtmlEntities(String(row.title || "")).replace(/\s+/g, " ").trim(),
    };
}

function formatTitles(rows: TitleRow[]): string {
    return rows.map((row) => `${row.id}: ${row.title}`).join("\n");
}

export const LabelTitleService = {
    async checkDuplicates(env: Env, ai: Ai) {
        const { results } = await env.DB.prepare(
            `SELECT id, title
             FROM news
             WHERE label IS NULL OR label = ''
             ORDER BY pub_date DESC
             LIMIT ?`
        ).bind(MAX_DUPLICATE_TITLES_PER_RUN).all();

        if (!results || results.length == 0) {
            return;
        }

        const candidates = results.map(normalizeRow);
        const references = (await env.DB.prepare(
            `SELECT id, title
             FROM news
             WHERE label = 'New'
             ORDER BY pub_date DESC
             LIMIT ?`
        ).bind(MAX_REFERENCE_TITLES).all()).results.map(normalizeRow);

        console.log(`Checking ${candidates.length} title(s) with ${DUPLICATE_LABEL_MODEL}.`);

        try {
            const response = await ai.run(DUPLICATE_LABEL_MODEL, {
                messages: [
                    {
                        role: "system",
                        content: `Classify Somali news candidate titles as "New" or "Duplicate".

Rules:
- A candidate is "Duplicate" if it reports the same event/topic as any reference title.
- A candidate is also "Duplicate" if it reports the same event/topic as an earlier candidate in the list.
- Use meaning, not wording. Somali and English titles can be duplicates of each other.
- Different source names, "Sawirro/Daawo", punctuation, or small wording changes do not make it New.
- If the candidate adds a genuinely different event, actor, outcome, or location, mark it "New".

Return valid JSON only with this shape: {"labels":[{"id":123,"label":"New"}]}.`,
                    },
                    {
                        role: "user",
                        content:
                            "Reference titles already labeled New:\n" +
                            (references.length ? formatTitles(references) : "None") +
                            "\n\nCandidate titles to classify in order:\n" +
                            formatTitles(candidates),
                    },
                ],
                temperature: 0,
                max_tokens: MAX_DUPLICATE_OUTPUT_TOKENS,
                response_format: {
                    type: "json_object",
                    json_schema: {
                        name: "duplicate_labels",
                        schema: {
                            type: "object",
                            properties: {
                                labels: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            id: { type: "number" },
                                            label: {
                                                type: "string",
                                                enum: ["New", "Duplicate"],
                                            },
                                        },
                                        required: ["id", "label"],
                                        additionalProperties: false,
                                    },
                                },
                            },
                            required: ["labels"],
                            additionalProperties: false,
                        },
                    },
                },
            });

            const candidateIds = new Set(candidates.map((candidate) => candidate.id));
            const parsed = parseDuplicateLabels(response)
                .filter((item) => candidateIds.has(item.id));
            console.log("Duplicate check result:", parsed);

            const statements = parsed.map((item) => {
                return env.DB.prepare(`
                    UPDATE news 
                    SET label = ? 
                    WHERE id = ?
                `).bind(item.label, item.id);
            });

            if (statements.length > 0) {
                await env.DB.batch(statements);
                console.log(`Updated labels for ${statements.length} articles.`);
            }
        } catch (error) {
            console.error("AI Duplicate Check Failed:", error);
        }
    },
};
