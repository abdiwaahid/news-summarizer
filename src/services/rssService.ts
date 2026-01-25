import { parseHTML } from "linkedom";

export const RssService = {
    SOURCES: [
        'https://horseedmedia.net/feed/',
        'https://puntlandpost.net/feed/',
        'https://www.caasimada.net/feed/',
        'https://shabellemedia.com/feed/',
        'https://sonna.so/so/feed/',
        'https://www.hiiraan.com/wararkamaanta.xml'
    ],

    async syncAll(env: Env) {
        const statements = [];

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        for (const url of this.SOURCES) {
            try {
                const response = await fetch(url);
                const xml = await response.text();
                const { document } = parseHTML(xml, "text/xml");
                const items = document.querySelectorAll("item");

                for (const item of items) {
                    const title = item.querySelector("title")?.textContent || "";
                    const link = item.querySelector("link")?.textContent || "";
                    const pubDate = item.querySelector("pubDate")?.textContent || "";
                    
                    const date = new Date(pubDate);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    if(date >= today){
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
    }
};