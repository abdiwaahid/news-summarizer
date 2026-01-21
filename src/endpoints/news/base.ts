import { z } from "zod";

export const news = z.object({
	id: z.number().int().optional(),
	title: z.string(),
	url: z.string().url(),
	pub_date: z.string(),
	content: z.string().optional(),
	label: z.string().optional(),
	processed: z.number().int().default(0),
	post_text: z.string().optional(),
	posted: z.number().int().default(0),
	image_url: z.string().optional(),
});

export const NewsModel = {
	tableName: "news",
	primaryKeys: ["id"],
	schema: news,
	serializerObject: news,
};
