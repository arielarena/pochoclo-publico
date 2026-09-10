/**
 * Detección de crawlers para las Cloudflare Pages Functions.
 *
 * SOLO se usa para decidir si vale la pena reescribir el HTML (título, meta,
 * JSON-LD). Un visitante humano nunca pasa por acá: `esCrawler()` corta al
 * toque y la función devuelve el mismo archivo estático de siempre, sin
 * ningún costo agregado — nada de lo que ve una persona real cambia.
 *
 * QUÉ CUBRE, y por qué la lista es amplia: `/[^]*bot/i` ya agarra a
 * Googlebot, Bingbot, GPTBot, ClaudeBot, Applebot y DuckDuckBot; el resto
 * son los que no llevan "bot" en el nombre (Twitterbot sí lo lleva, pero
 * facebookexternalhit, WhatsApp, Slack, Discord y los de asistentes de IA
 * que navegan "como una persona" no). Sumar uno de más acá no tiene costo
 * (nunca lo ve un humano); omitir uno relevante sí lo tiene, porque esa IA
 * sigue viendo el shell vacío que este archivo existe para evitar.
 */
const PATRON_CRAWLER =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|discordbot|slackbot|embedly|quora|redditbot|pinterest|vkshare|skypeuripreview|w3c_validator|chatgpt-user|oai-searchbot|claude-web|anthropic-ai|perplexity|ccbot|bytespider|duckassist|yandex|baiduspider/i;

export function esCrawler(request) {
  const agente = request.headers.get('user-agent') ?? '';
  return PATRON_CRAWLER.test(agente);
}
