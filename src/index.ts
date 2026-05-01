import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { newsRouter } from "./endpoints/news/router";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { ScraperService } from "./services/scraper";
import { RssService } from "./services/rssService";
import { LabelTitleService } from "./services/labelTitle";
import { SummarizeService } from "./services/summarize";
import { PostService } from "./services/postService";

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
    if (err instanceof ApiException) {
        return c.json(
            { success: false, errors: err.buildResponse() },
            err.status as ContentfulStatusCode,
        );
    }

    console.error("Global error handler caught:", err);
    return c.json(
        {
            success: false,
            errors: [{ code: 7000, message: "Internal Server Error" }],
        },
        500,
    );
});

const openapi = fromHono(app, {
    docs_url: "/",
    schema: {
        info: {
            title: "My Awesome API",
            version: "2.0.0",
            description: "This is the documentation for my awesome API.",
        },
    },
});

openapi.route("/news", newsRouter);

export default {
    app: app,
    fetch: app.fetch,
    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        const now = new Date();
        const minute = now.getMinutes();

        if (minute % 60 === 0) {
            ctx.waitUntil(RssService.syncAll(env));
        }

        if (minute % 10 === 0) {
            ctx.waitUntil(ScraperService.processPending(env));
        }

        if (minute % 50 === 0) {
            ctx.waitUntil(LabelTitleService.checkDuplicates(env, env.AI));
        }

        if (minute % 30 === 0) {
            ctx.waitUntil(SummarizeService.summarizePending(env, env.AI));
            ctx.waitUntil(PostService.postPending(env));
        }

        if (now.getHours() === 6 && minute === 0) {
            ctx.waitUntil(RssService.removePrevNews(env));
        }
    },
};