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
    "caasimada.net": {
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
    "hiiraan.com": {
        title: "h1.story-title, .article-header h1",
        content: ".story-content p, .article-content p",
        image: ".story-image img, .article-image img",
    },
};

const MAX_ARTICLES_PER_RUN = 1;
const MAX_CONTENT_LENGTH = 5000;
const MAX_PARAGRAPHS_PER_ARTICLE = 50;

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

function cleanText(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

function isUsefulContent(text: string): boolean {
    if (text.length < 50) return false;
    if (/[{}]|@media|!important|rgba?\(|#[a-f0-9]{3,6}/i.test(text)) return false;
    if (/^(facebook|twitter|somali links|rss)$/i.test(text)) return false;
    return true;
}

class ParagraphCollector implements HTMLRewriterElementContentHandlers {
    private currentText: string[] | null = null;
    private readonly paragraphs: string[] = [];

    element(element: Element): void {
        this.currentText = [];
        element.onEndTag(() => {
            const text = cleanText((this.currentText || []).join(""));
            if (
                this.paragraphs.length < MAX_PARAGRAPHS_PER_ARTICLE &&
                isUsefulContent(text)
            ) {
                this.paragraphs.push(text);
            }
            this.currentText = null;
        });
    }

    text(text: Text): void {
        if (this.currentText) {
            this.currentText.push(text.text);
        }
    }

    getContent(): string | null {
        const content = this.paragraphs.join("\n").substring(0, MAX_CONTENT_LENGTH);
        return content || null;
    }
}

class AttributeCollector implements HTMLRewriterElementContentHandlers {
    value: string | null = null;

    constructor(private readonly attributes: string[]) {}

    element(element: Element): void {
        if (this.value) {
            return;
        }

        for (const attribute of this.attributes) {
            const value = element.getAttribute(attribute);
            if (value) {
                this.value = value;
                return;
            }
        }
    }
}

export const ScraperService = {
    async processPending(env: Env) {
        const { results } = await env.DB.prepare(
            "SELECT id, url, title FROM news WHERE label='New' AND (content IS NULL OR content = '') LIMIT ?"
        ).bind(MAX_ARTICLES_PER_RUN).all();

        for (const row of results) {
            try {
                const url = row.url as string;
                const response = await fetch(url, {
                    headers: { "User-Agent": "Mozilla/5.0 (compatible; Cloudflare Worker)" },
                });

                const config = getConfigByUrl(url);
                const contentCollector = new ParagraphCollector();
                const articleImageCollector = new AttributeCollector(["src", "data-src"]);
                const fallbackImageCollector = new AttributeCollector(["content"]);

                await new HTMLRewriter()
                    .on(config?.content || "p", contentCollector)
                    .on(config?.image || "img", articleImageCollector)
                    .on('meta[property="og:image"]', fallbackImageCollector)
                    .transform(response)
                    .text();

                const content = contentCollector.getContent();
                let image = articleImageCollector.value || fallbackImageCollector.value;

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
