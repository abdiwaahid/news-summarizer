import { Hono } from "hono";
import { fromHono } from "chanfana";
import { NewsList } from './newsList';
import { NewsCreate } from "./newsCreate";
import { NewsUpdate } from "./newsUpdate";
import { NewsDelete } from "./newsDelete";

export const newsRouter = fromHono(new Hono());

newsRouter.get("/", NewsList);
newsRouter.post("/", NewsCreate);
newsRouter.patch("/:id", NewsUpdate);
newsRouter.delete("/:id", NewsDelete);