export const LabelTitleService = {
    async checkDuplicates(env: Env, ai: Ai) {
        const { results } = await env.DB.prepare(
            "SELECT id, title FROM news WHERE label IS NULL OR label = ''"
        ).all();

        if (!results || results.length == 0) {
            return;
        }

        const existingTitles = results.map((r) => r.title).join("\n");

        try {
            const response = await ai.run("@cf/qwen/qwen1.5-14b-chat-awq", {
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
                max_tokens: 2048,
            });

            const parsed = JSON.parse((response as any).response || response);
            console.log("Duplicate check result:", parsed);

            const statements = parsed.map((item: any) => {
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