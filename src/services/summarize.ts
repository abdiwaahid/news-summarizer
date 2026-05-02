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

function parsePostJson(rawJson: string): string {
    const cleanedJson = rawJson
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    let parsed: { post?: unknown };
    try {
        parsed = JSON.parse(cleanedJson) as { post?: unknown };
    } catch {
        parsed = JSON.parse(escapeControlCharsInJsonStrings(cleanedJson)) as { post?: unknown };
    }

    if (typeof parsed.post !== "string" || parsed.post.trim() === "") {
        throw new Error("AI JSON response did not include a valid post string.");
    }

    return parsed.post.trim();
}

function escapeControlCharsInJsonStrings(json: string): string {
    let escaped = "";
    let inString = false;
    let previousWasEscape = false;

    for (const char of json) {
        if (previousWasEscape) {
            escaped += char;
            previousWasEscape = false;
            continue;
        }

        if (char === "\\") {
            escaped += char;
            previousWasEscape = true;
            continue;
        }

        if (char === "\"") {
            inString = !inString;
            escaped += char;
            continue;
        }

        if (inString && char === "\n") {
            escaped += "\\n";
            continue;
        }

        if (inString && char === "\r") {
            escaped += "\\r";
            continue;
        }

        if (inString && char === "\t") {
            escaped += "\\t";
            continue;
        }

        escaped += char;
    }

    return escaped;
}

export const SummarizeService = {
    async summarizePending(env: Env, ai: Ai) {
        const model = "@cf/google/gemma-3-12b-it" as keyof AiModels;
        const { results } = await env.DB.prepare(
            "SELECT id, title, content FROM news WHERE label='New' AND (post IS NULL OR post = '') AND content IS NOT NULL LIMIT 5"
        ).all();

        for (const row of results) {
            try {
                const response = await ai.run(model, {
                    messages: [
                        {
                            role: "system",
                            content: `Role: Social Media Manager – Af-Soomaali Facebook posts only

Absolute rules – waa inaad 100% raacdaa:
- Af-Soomaali fudud oo dadweyne kaliya
- Mamnuuc: source • website • qoraa • link • emoji • bullet • number • cinwaan • related news
- Qaab: sadarro isku xiran + double newline kadib sadar kasta
- Dherer: 120–240 erey (4–7 sadar)
- Habka: ugu muhiimsan → faahfaahin → gabagabo kooban
- Return valid JSON only. No markdown, no code block, no explanation.
- JSON shape must be exactly: {"post":"..."}
- The post value must be one JSON string. Escape paragraph breaks as \\n\\n. Do not put raw line breaks inside the string.`,
                        },
                        {
                            role: "user",
                            content: "Warka la soo koobayo:\n " + (row.content as string) + "\n\nSoo koob sida kor ku xusan. Ku celi JSON object keliya.",
                        },
                    ],
                    temperature: 0.05,
                    max_tokens: 1024,
                });

                const rawJson = extractAiText(response);
                const post = parsePostJson(rawJson);
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
