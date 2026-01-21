import { Hono } from "hono";
import { fromHono } from "chanfana";
import { NewsList } from './newsList';

export const newsRouter = fromHono(new Hono());

newsRouter.get("/", NewsList);
