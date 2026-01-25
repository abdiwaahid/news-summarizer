import { parseHTML } from "linkedom";

export const LabelTitleService = {
    async checkDuplicates(env: Env) {
        const { results } = await env.DB.prepare(
            "SELECT id, title FROM news WHERE label IS NULL OR label = ''"
        ).all();

        if (!results || results.length == 0) {
            return;
        };

        const existingTitles = results.map(r => r.title).join("\n");

        try {
            const response = await fetch("https://api.x.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${env.GROK_API}`
                },
                body: JSON.stringify({
                    "messages": [
                        {
                            "role": "system",
                            "content": `Classify each title as "New" or "Duplicate".

                            Rules - strict order:
                            1. First occurrence of a topic → "New"
                            2. Same or very similar meaning as any earlier title → "Duplicate"
                            3. Be strict - different source name or small wording change is still Duplicate

                            Output only valid JSON array.`
                        },
                        {
                            "role": "user",
                            "content": "\n\nTitles:\n" + existingTitles
                        }
                    ],
                    "model": "grok-4-fast-reasoning",
                    "stream": false,
                    "temperature": 0,
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {
                            "name": "classified_titles",
                            "strict": true,
                            "schema": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "title": {
                                            "type": "string"
                                        },
                                        "label": {
                                            "type": "string",
                                            "enum": ["New", "Duplicate"]
                                        }
                                    },
                                    "required": ["title", "label"],
                                    "additionalProperties": false
                                }
                            }
                        }
                    }
                })
            });

            const data: any = await response.json();
            // Parse the "choices[0].message.content" which is a JSON string
            const parsed = JSON.parse(data.choices[0].message.content);
            const res = parsed.results || parsed;
            console.log(res, data);
            const statements = res.map((item:any) => {
                return env.DB.prepare(`
                    UPDATE news 
                    SET label = ? 
                    WHERE title = ?
                `).bind(item.label, item.title);
            });

            // 4. Single Query to update all rows
            if (statements.length > 0) {
                await env.DB.batch(statements);
                console.log(`Updated labels for ${statements.length} articles.`);
            }

        } catch (error) {
            console.error("Grok Duplicate Check Failed:", error);
        }
    }
};