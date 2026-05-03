import { RssService } from "./services/rssService";
import { ScraperService } from "./services/scraper";
import { LabelTitleService } from "./services/labelTitle";
import { SummarizeService } from "./services/summarize";
import { PostService } from "./services/postService";

async function runScheduledJobs(env: Env): Promise<void> {
	const now = new Date();
	const minute = now.getMinutes();

	await RssService.syncAll(env);
	await ScraperService.processPending(env);
	await LabelTitleService.checkDuplicates(env, env.AI);
	await SummarizeService.summarizePending(env, env.AI);

	// if (minute % 30 === 0) {
	// 	await PostService.postPending(env);
	// }

	// if (now.getHours() === 6 && minute === 0) {
	// 	await RssService.removePrevNews(env);
	// }
}

export default {
	async fetch(req) {
		const url = new URL(req.url);
		url.pathname = "/__scheduled";
		url.searchParams.append("cron", "*/10 * * * *");
		return new Response(
			`To test the scheduled handler, ensure you have used the "--test-scheduled" then try running "curl ${url.href}".`
		);
	},

	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(runScheduledJobs(env));
	}
} satisfies ExportedHandler<Env>;
