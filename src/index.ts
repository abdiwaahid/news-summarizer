import { RssService } from "./services/rssService";
import { ScraperService } from "./services/scraper";
import { LabelTitleService } from "./services/labelTitle";
import { SummarizeService } from "./services/summarize";
import { PostService } from "./services/postService";

async function runScheduledStep(name: string, task: () => Promise<void>): Promise<void> {
	const startedAt = Date.now();
	try {
		await task();
	} finally {
		console.log(`[scheduled] ${name} finished in ${Date.now() - startedAt}ms`);
	}
}

async function runScheduledJobs(env: Env, scheduledTime: number): Promise<void> {
	const scheduledAt = new Date(scheduledTime);
	const minute = scheduledAt.getUTCMinutes();
	const slot = minute % 5;

	if (scheduledAt.getUTCHours() === 6 && minute === 0) {
		await runScheduledStep("cleanup", () => RssService.removePrevNews(env));
		return;
	}

	if ( minute === 30) {
		await runScheduledStep("label", () => LabelTitleService.checkDuplicates(env, env.AI));
		return;
	}

	switch (slot) {
		case 0:
			await runScheduledStep("rss", () => RssService.syncNext(env, scheduledTime));
			break;
		case 1:
		case 2:
			await runScheduledStep("scrape", () => ScraperService.processPending(env));
			break;
		case 3:
			await runScheduledStep("summarize", () => SummarizeService.summarizePending(env, env.AI));
			break;
		case 4:
			await runScheduledStep("post", () => PostService.postPending(env));
			break;
		default:
			console.warn(`[scheduled] skipped unexpected cron minute ${minute}`);
	}
}

async function runScheduledJobsWithLogging(env: Env, scheduledTime: number): Promise<void> {
	try {
		await runScheduledJobs(env, scheduledTime);
	} catch (error) {
		console.error("[scheduled] failed:", error);
		throw error;
	}
}

export default {
	async fetch(req) {
		const url = new URL(req.url);
		url.pathname = "/__scheduled";
		url.searchParams.append("cron", "* * * * *");
		return new Response(
			`To test the scheduled handler, ensure you have used the "--test-scheduled" then try running "curl ${url.href}".`
		);
	},

	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(runScheduledJobsWithLogging(env, controller.scheduledTime));
	}
} satisfies ExportedHandler<Env>;
