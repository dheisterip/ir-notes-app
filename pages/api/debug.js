export default function handler(req, res) {
  res.json({
    url_set: !!process.env.UPSTASH_REDIS_REST_URL,
    url_length: (process.env.UPSTASH_REDIS_REST_URL || '').length,
    url_starts: (process.env.UPSTASH_REDIS_REST_URL || '').substring(0, 15),
    token_set: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    token_length: (process.env.UPSTASH_REDIS_REST_TOKEN || '').length,
  })
}
