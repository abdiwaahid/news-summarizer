CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    pub_date TEXT,
    content TEXT,
    image_url TEXT,
    label TEXT DEFAULT 'New',
    post TEXT,
    posted INTEGER DEFAULT 0,
    processed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_news_label ON news(label);
CREATE INDEX IF NOT EXISTS idx_news_pub_date ON news(pub_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_url_unique ON news(url);
