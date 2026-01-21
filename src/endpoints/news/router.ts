import { Hono } from "hono";
import { fromHono } from "chanfana";
import { NewsList } from './newsList';

export const tasksRouter = fromHono(new Hono());

tasksRouter.get("/", NewsList);
