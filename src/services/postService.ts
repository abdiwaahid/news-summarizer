export const PostService = {
    async postPending(env: Env) {
        const { results } = await env.DB.prepare(
            "SELECT id, post, image_url FROM news WHERE label='New' AND post IS NOT NULL AND posted IS NULL ORDER BY pub_date DESC LIMIT 10"
        ).all();

        for (const row of results) {
            try {
                const post = row.post as string;
                const imageUrl = row.image_url as string | null;

                const hasImage = imageUrl && !imageUrl.endsWith(".webp");

                const response = await fetch(
                    hasImage
                        ? `https://graph.facebook.com/v22.0/me/photos?access_token=${env.FACEBOOK_TOKEN}`
                        : `https://graph.facebook.com/v22.0/me/feed?access_token=${env.FACEBOOK_TOKEN}`,
                    {
                        method: "POST",
                        body: hasImage
                            ? JSON.stringify({ caption: post, url: imageUrl })
                            : JSON.stringify({ message: post }),
                        headers: { "Content-Type": "application/json" },
                    }
                );

                const result = (await response.json()) as any;
                if (result.id || result.post_id) {
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