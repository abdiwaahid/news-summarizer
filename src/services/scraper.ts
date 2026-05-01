import { parseHTML } from "linkedom";

const SITE_CONFIGS: Record<string, { title: string; content: string; image: string }> = {
    "horseedmedia.net": {
        title: "h1.entry-title",
        content: ".entry-content > p",
        image: ".entry-content figure.wp-block-image img",
    },
    "puntlandpost.net": {
        title: "h1.entry-title",
        content: ".entry-content.single-post-content p",
        image: ".entry-content.single-post-content figure.wp-block-image img",
    },
    "www.caasimada.net": {
        title: "h1.entry-title, h1.tdb-title-text",
        content: ".td-post-content p, .tdb_single_content p",
        image: ".td-post-featured-image img, .tdb_single_featured_image img, .td-post-content img",
    },
    "shabellemedia.com": {
        title: "h1.entry-title",
        content: ".td-post-content p",
        image: ".td-post-featured-image img, .td-post-content img",
    },
    "sonna.so": {
        title: "h1.entry-title, h1.s-title",
        content: ".entry-content p, .s-ct p, .single-content p",
        image: ".featured-holder img, .single-featured img, .entry-content img",
    },
    "www.hiiraan.com": {
        title: "h1.story-title",
        content: ".story-content p, .article-content p",
        image: ".story-image img, .article-image img",
    },
};

function getHostname(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return "";
    }
}

function getConfigByUrl(url: string): { title: string; content: string; image: string } | null {
    const hostname = getHostname(url);
    return SITE_CONFIGS[hostname] || null;
}

export const ScraperService = {
    async processPending(env: Env) {
        const { results } = await env.DB.prepare(
            "SELECT id, url, title FROM news WHERE label='New' AND (content IS NULL OR content = '') LIMIT 10"
        ).all();

        for (const row of results) {
            try {
                const url = row.url as string;
                const response = await fetch(url, {
                    headers: { "User-Agent": "Mozilla/5.0 (compatible; Cloudflare Worker)" },
                });
                const html = await response.text();
                const { document } = parseHTML(html);

                const config = getConfigByUrl(url);

                let content: string | null = null;
                let image: string | null = null;

                if (config) {
                    const elements = [...document.querySelectorAll(config.content)] as any[];
                    content = elements
                        .map((el) => el.textContent?.trim())
                        .filter(Boolean)
                        .join("\n");

                    const imgEl = document.querySelector(config.image);
                    image = imgEl?.getAttribute("src") || imgEl?.getAttribute("data-src") || null;
                } else {
                    image = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
                    content = document.querySelector("body")?.textContent?.trim().substring(0, 5000);
                }

                if (image && image.startsWith("/")) {
                    const baseUrl = getHostname(url);
                    image = `https://${baseUrl}${image}`;
                }

                await env.DB.prepare(
                    "UPDATE news SET content = ?, image_url = ? WHERE id = ?"
                ).bind(content, image, row.id).run();
            } catch (err) {
                console.error(`Failed to scrape ${(row as any).url}:`, err);
            }
        }
    },
};