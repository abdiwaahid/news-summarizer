import { RssService } from "./services/rssService";
import { ScraperService } from "./services/scraper";
import { LabelTitleService } from "./services/labelTitle";
import { SummarizeService } from "./services/summarize";
import { PostService } from "./services/postService";

export default {
	async fetch(req) {
		const url = new URL(req.url);
		url.pathname = "/__scheduled";
		url.searchParams.append("cron", "*/10 * * * *");
		return new Response(
			`To test the scheduled handler, ensure you have used the "--test-scheduled" then try running "curl ${url.href}".`
		);
	},

	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		const now = new Date();
		const minute = now.getMinutes();
		console.log("Scheduled event triggered", { minute, controller, env, ctx });
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
} satisfies ExportedHandler<Env>;