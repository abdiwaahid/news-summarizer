export const SummarizeService = {
    async summarizePending(env: Env, ai: Ai) {
        const { results } = await env.DB.prepare(
            "SELECT id, title, content FROM news WHERE label='New' AND (post IS NULL OR post = '') AND content IS NOT NULL LIMIT 5"
        ).all();

        for (const row of results) {
            try {
                const response = await ai.run("@cf/qwen/qwen1.5-14b-chat-awq", {
                    messages: [
                        {
                            role: "system",
                            content: `Role: Social Media Manager – Af-Soomaali Facebook posts only

Absolute rules – waa inaad 100% raacdaa:
- Af-Soomaali fudud oo dadweyne kaliya
- Mamnuuc: source • website • qoraa • link • emoji • bullet • number • cinwaan • related news
- Qaab: sadarro isku xiran + double newline kadib sadar kasta
- Dherer: 120–240 erey (4–7 sadar)
- Habka: ugu muhiimsan → faahfaahin → gabagabo kooban`,
                        },
                        {
                            role: "user",
                            content: "Warka la soo koobayo:\n " + (row.content as string) + "\n\nSoo koob sida kor ku xusan oo keliya – ha ku darin wax kale.",
                        },
                    ],
                    temperature: 0.05,
                    max_tokens: 512,
                });

                const post = (response as any).response || response;

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