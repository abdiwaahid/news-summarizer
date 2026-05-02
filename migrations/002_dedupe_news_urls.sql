DELETE FROM news
WHERE id NOT IN (
    SELECT MIN(id)
    FROM news
    GROUP BY url
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_url_unique ON news(url);
