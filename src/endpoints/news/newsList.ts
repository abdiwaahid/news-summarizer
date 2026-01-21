import { D1ListEndpoint, Bool } from "chanfana";
import { z } from "zod";
import { NewsModel } from "./base";
import { HandleArgs } from "../../types";

export class NewsList extends D1ListEndpoint<HandleArgs> {
    _meta = {
        model: NewsModel,
    };

    schema = {
        summary: "List and search news",
        request: {
            query: z.object({
                search: z.string().optional().description("Search by title"),
                is_filled: Bool({ optional: true, description: "Filter items with scraped content" }),
                limit: z.number().int().default(20),
                page: z.number().int().default(1),
            }),
        },
    };

    async handle(c: any) {
        const { search, is_filled, limit, page } = c.req.valid("query");
        const { DB } = c.env;

        let query = "SELECT * FROM news WHERE 1=1";
        const params: any[] = [];

        // 1. Add Search by Title logic
        if (search) {
            query += " AND title LIKE ?";
            params.push(`%${search}%`);
        }

        // 2. Add Content Filter logic (Replaces n8n FilterContentFilled)
        if (is_filled === true) {
            query += " AND content IS NOT NULL AND content != ''";
        } else if (is_filled === false) {
            query += " AND (content IS NULL OR content = '')";
        }

        // 3. Add Pagination
        query += " ORDER BY id DESC LIMIT ? OFFSET ?";
        params.push(limit, (page - 1) * limit);

        const { results } = await DB.prepare(query).bind(...params).all();
        
        return { 
            success: true, 
            data: results,
            meta: { page, limit } 
        };
    }
}