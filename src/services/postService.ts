const FACEBOOK_API_VERSION = 'v21.0';
const MAX_FACEBOOK_TEXT_LENGTH = 1800;

type FacebookResult = {
    id?: string;
    post_id?: string;
    error?: {
        code?: number;
        message?: string;
    };
};

function trimFacebookText(text: string): string {
    const trimmed = text.trim();

    if (trimmed.length <= MAX_FACEBOOK_TEXT_LENGTH) {
        return trimmed;
    }

    return `${trimmed.slice(0, MAX_FACEBOOK_TEXT_LENGTH - 1).trim()}…`;
}

function isFacebookSuccess(result: FacebookResult): boolean {
    return Boolean(result.id || result.post_id);
}

function shouldRetryWithoutImage(result: FacebookResult): boolean {
    return result.error?.code === 1 && /reduce the amount of data/i.test(result.error.message || "");
}

async function publishToFacebook(
    pid: string,
    token: string,
    post: string,
    imageUrl: string | null
): Promise<FacebookResult> {
    const endpoint = imageUrl ? "photos" : "feed";
    const url = new URL(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/${pid}/${endpoint}`);
    url.searchParams.set("access_token", token);

    const body = imageUrl
        ? { caption: post, url: imageUrl }
        : { message: post };

    const response = await fetch(url.toString(), {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });

    return await response.json() as FacebookResult;
}

export const PostService = {
    async postPending(env: Env) {
        const token = env.FACEBOOK_TOKEN;
        const pid = env.FACEBOOK_PAGE_ID || 'me';

        if (!token) {
            console.warn("Skipping Facebook post: FACEBOOK_TOKEN is not configured.");
            return;
        }

        const { results } = await env.DB.prepare(
            "SELECT id, post, image_url FROM news WHERE label='New' AND post IS NOT NULL AND posted = 0 ORDER BY pub_date DESC LIMIT 5"
        ).all();

        for (const row of results) {
            try {
                const post = trimFacebookText(row.post as string);
                const imageUrl = row.image_url as string | null;

                const hasImage = imageUrl && !imageUrl.endsWith(".webp");
                let result = await publishToFacebook(pid, token, post, hasImage ? imageUrl : null);

                if (hasImage && shouldRetryWithoutImage(result)) {
                    console.warn(`Retrying article ${row.id} as text-only after Facebook rejected the image post.`);
                    result = await publishToFacebook(pid, token, post, null);
                }

                if (isFacebookSuccess(result)) {
                    await env.DB.prepare(
                        "UPDATE news SET posted = 1 WHERE id = ?"
                    ).bind(row.id).run();
                    console.log(`Posted article ${row.id} to Facebook`);
                } else {
                    console.error(`Failed to post article ${row.id}:`, result);
                }
            } catch (err) {
                console.error(`Failed to post article ${(row as any).id}:`, err);
            }
        }
    },
};
