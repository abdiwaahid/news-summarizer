import { parseHTML } from "linkedom";

export const ScraperService = {
    async processPending(env: Env) {
        // Find news where content is empty (Replaces n8n "NewsList2" -> "FilterEmptyContent")
        const { results } = await env.DB.prepare(
            "SELECT id, url FROM news WHERE content IS NULL OR content = '' LIMIT 5"
        ).all();

        for (const row of results) {
            try {
                const response = await fetch(row.url);
                const html = await response.text();
                const { document } = parseHTML(html);

                const content = document.querySelector("body")?.textContent?.trim();
                const image = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
                
                await env.DB.prepare(
                    "UPDATE news SET content = ?, image_url = ? WHERE id = ?"
                ).bind(content, image, row.id).run();
            } catch (err) {
                console.error(`Failed to scrape ${row.url}:`, err);
            }
        }
    }
};