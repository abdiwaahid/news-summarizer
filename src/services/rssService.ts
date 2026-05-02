function extractField(xml: string, fieldName: string): string {
    const startTag = `<${fieldName}>`;
    const endTag = `</${fieldName}>`;
    const startIdx = xml.indexOf(startTag);
    if (startIdx === -1) return "";
    const valueStart = startIdx + startTag.length;
    const endIdx = xml.indexOf(endTag, valueStart);
    if (endIdx === -1) return "";
    return xml.substring(valueStart, endIdx).trim();
}

export const RssService = {
    SOURCES: [
        "https://horseedmedia.net/feed/",
        "https://puntlandpost.net/feed/",
        "https://www.caasimada.net/feed/",
        "https://shabellemedia.com/feed/",
        "https://sonna.so/so/feed/",
        "https://www.hiiraan.com/wararkamaanta.xml",
    ],

    async syncAll(env: Env) {
        const statements = [];
        const todayThreshold = new Date();
        todayThreshold.setUTCHours(0, 0, 0, 0);

        for (const url of this.SOURCES) {
            try {
                const response = await fetch(url, {
                    headers: { "User-Agent": "Mozilla/5.0 (compatible; Cloudflare Worker)" },
                });
                const xml = await response.text();
                
                const itemPattern = /<item[^>]*>[\s\S]*?<\/item>/gi;
                const itemMatches = xml.match(itemPattern) || [];
                
                for (const itemXml of itemMatches) {
                    const title = extractField(itemXml, "title");
                    const link = extractField(itemXml, "link");
                    const pubDate = extractField(itemXml, "pubDate");
                    
                    const date = new Date(pubDate);

                    if (date >= todayThreshold) {
                        statements.push(
                            env.DB.prepare(`
                                INSERT OR IGNORE INTO news (title, url, pub_date) 
                                VALUES (?, ?, ?)
                            `).bind(title, link, pubDate)
                        );
                    }
                }
            } catch (err) {
                console.error(`Failed to fetch RSS from ${url}:`, err);
            }
        }

        if (statements.length > 0) {
            await env.DB.batch(statements);
            console.log(`Successfully processed ${statements.length} items via batch.`);
        }
    },

    async removePrevNews(env: Env) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        await env.DB.prepare(
            "DELETE FROM news WHERE DATE(pub_date) < ?"
        ).bind(yesterdayStr).run();

        console.log("Removed previous days news");
    },
};