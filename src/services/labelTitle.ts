const DUPLICATE_LABEL_MODEL = "@cf/meta/llama-3.2-1b-instruct" as keyof AiModels;
const MAX_DUPLICATE_TITLES_PER_RUN = 10;
const MAX_DUPLICATE_OUTPUT_TOKENS = 300;

function extractAiText(response: unknown): string {
    if (typeof response === "string") {
        return response.trim();
    }

    if (!response || typeof response !== "object") {
        throw new Error("AI response did not include text content.");
    }

    const data = response as {
        response?: unknown;
        choices?: Array<{
            text?: unknown;
            message?: {
                content?: unknown;
            };
        }>;
    };

    const text =
        (typeof data.response === "string" && data.response) ||
        (typeof data.choices?.[0]?.message?.content === "string" && data.choices[0].message.content) ||
        (typeof data.choices?.[0]?.text === "string" && data.choices[0].text);

    if (!text) {
        throw new Error("AI response did not include text content.");
    }

    return text.trim();
}

function parseDuplicateLabels(response: unknown): Array<{ title: string; label: string }> {
    const rawJson = extractAiText(response)
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    const parsed = JSON.parse(rawJson);

    if (!Array.isArray(parsed)) {
        throw new Error("AI duplicate response was not a JSON array.");
    }

    return parsed.filter((item): item is { title: string; label: string } => {
        return item &&
            typeof item === "object" &&
            typeof item.title === "string" &&
            typeof item.label === "string";
    });
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

        const existingTitles = results.map((r) => r.title).join("\n");
        console.log(`Checking ${results.length} title(s) with ${DUPLICATE_LABEL_MODEL}.`);

        try {
            const response = await ai.run(DUPLICATE_LABEL_MODEL, {
                messages: [
                    {
                        role: "system",
                        content: `Classify each title as "New" or "Duplicate".

Rules - strict order:
1. First occurrence of a topic → "New"
2. Same or very similar meaning as any earlier title → "Duplicate"
3. Be strict - different source name or small wording change is still Duplicate

Output only valid JSON array.`,
                    },
                    {
                        role: "user",
                        content: "\n\nTitles:\n" + existingTitles,
                    },
                ],
                temperature: 0,
                max_tokens: MAX_DUPLICATE_OUTPUT_TOKENS,
            });

            const parsed = parseDuplicateLabels(response);
            console.log("Duplicate check result:", parsed);

            const statements = parsed.map((item) => {
                return env.DB.prepare(`
                    UPDATE news 
                    SET label = ? 
                    WHERE title = ?
                `).bind(item.label, item.title);
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
