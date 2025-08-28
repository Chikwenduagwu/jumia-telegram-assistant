import OpenAI from "openai";
import { Telegraf } from "telegraf";
import axios from "axios";
import * as cheerio from "cheerio";

// Note: Vercel will inject environment variables from your project settings.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;
const MODEL = "accounts/sentientfoundation-serverless/models/dobby-mini-unhinged-plus-llama-3-1-8b";
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "512", 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ""; // optional extra security
const JUMIA_HOSTS = ["jumia.com.ng", "www.jumia.com.ng", "jumia.com", "www.jumia.com"];

// Basic env checks (log only; don't crash Vercel build if missing)
if (!TELEGRAM_BOT_TOKEN) console.warn("Warning: TELEGRAM_BOT_TOKEN not set.");
if (!FIREWORKS_API_KEY) console.warn("Warning: FIREWORKS_API_KEY not set.");

// Create OpenAI-compatible client pointing to Fireworks
const openai = new OpenAI({
  apiKey: FIREWORKS_API_KEY,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

// Create bot instance (do NOT call bot.launch() in serverless)
const bot = new Telegraf(TELEGRAM_BOT_TOKEN, { handlerTimeout: 90_000 });

// ---- Utilities ----
function extractUrls(text) {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s)]+/g;
  return Array.from(text.matchAll(urlRegex)).map((m) => m[0]);
}

function isJumiaUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return JUMIA_HOSTS.some((h) => u.hostname.endsWith(h));
  } catch {
    return false;
  }
}

async function fetchProductInfo(url) {
  try {
    const { data } = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 8000 });
    const $ = cheerio.load(data);
    // Best-effort selectors — Jumia's HTML can change
    const title = $("h1").first().text().trim() || null;
    const price = $("div.-fs24 span, span.-b.-ltr.-fs24, span.prc").first().text().trim() || null;
    const availability = $("[data-testid='stock-availability']").first().text().trim() || null;
    return { url, title, price, availability };
  } catch (err) {
    return { url, error: "Could not fetch product details." };
  }
}

async function searchJumia(query) {
  try {
    const searchUrl = `https://www.jumia.com.ng/catalog/?q=${encodeURIComponent(query)}`;
    const { data } = await axios.get(searchUrl, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 8000 });
    const $ = cheerio.load(data);
    const items = [];
    $("article.prd").slice(0, 3).each((_, el) => {
      const name = $(el).find("h3.name").text().trim();
      const price = $(el).find("div.prc").text().trim() || null;
      const link = $(el).find("a.core").attr("href");
      if (name && link) items.push({ name, price, url: `https://www.jumia.com.ng${link}` });
    });
    return { searchUrl, items };
  } catch {
    return { error: "Search failed." };
  }
}

// ---- System prompt / guardrails ----
const SYSTEM_PROMPT = `
You are "Jumia Assistant" — a professional, concise, helpful shopping assistant for Jumia Nigeria.
Keep tone friendly and professional (no profanity). Use ₦ when quoting prices. If uncertain about live stock/prices, say so and give the product page link.
`;

// ---- Handlers ----
bot.start((ctx) => ctx.reply("👋 I'm the Jumia Assistant. Paste a Jumia link or ask for a product (e.g. 'air fryer under 50k')."));
bot.help((ctx) => ctx.reply("Send a Jumia product link for a summary, or ask for product options, delivery, returns or warranty info."));

bot.on("text", async (ctx) => {
  const userText = (ctx.message && ctx.message.text) ? ctx.message.text.trim() : "";
  await ctx.sendChatAction("typing");

  // Extract Jumia links (if any) and fetch details
  const urls = extractUrls(userText);
  const jumiaUrls = urls.filter(isJumiaUrl);
  let scraped = [];
  if (jumiaUrls.length) {
    scraped = await Promise.all(jumiaUrls.map(fetchProductInfo));
  }

  // Heuristic: if query looks like a product search, run search
  const looksLikeSearch = /price|buy|deal|best|under|cheapest|compare|vs|how much/i.test(userText);
  let searchContext = null;
  if (looksLikeSearch && jumiaUrls.length === 0) {
    searchContext = await searchJumia(userText);
  }

  // Build message history for the model
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  if (scraped.length) {
    messages.push({ role: "system", content: `Scraped Jumia product info (use if helpful):\n${JSON.stringify(scraped, null, 2)}` });
  }
  if (searchContext && !searchContext.error) {
    messages.push({ role: "system", content: `Jumia search results (use if helpful):\n${JSON.stringify(searchContext, null, 2)}` });
  }

  messages.push({ role: "user", content: userText });

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.4,
      max_tokens: MAX_TOKENS,
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || "Sorry — I couldn't generate a helpful reply.";
    await ctx.reply(reply, { disable_web_page_preview: false });
  } catch (err) {
    console.error("Model error:", err?.message || err);
    await ctx.reply("⚠️ I ran into an error while trying to answer. Try again in a bit.");
  }
});

// ---- Serverless handler for Vercel ----
export default async function handler(req, res) {
  // Health check
  if (req.method === "GET") {
    return res.status(200).send("Jumia Telegram Assistant (webhook) — OK");
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  // Optional security: verify Telegram's secret header if you set a secret when creating webhook
  if (WEBHOOK_SECRET) {
    const secretHeader = req.headers["x-telegram-bot-api-secret-token"];
    if (!secretHeader || secretHeader !== WEBHOOK_SECRET) {
      console.warn("Invalid webhook secret token");
      return res.status(401).send("Invalid webhook secret token");
    }
  }

  try {
    // Let Telegraf process the incoming update
    await bot.handleUpdate(req.body);
    return res.status(200).end();
  } catch (err) {
    console.error("bot.handleUpdate error:", err);
    return res.status(500).send("Bot error");
  }
}
