import axios from "axios";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const FIREWORKS_API = "https://api.fireworks.ai/inference/v1/chat/completions";
const MODEL = "accounts/sentientfoundation-serverless/models/dobby-mini-unhinged-plus-llama-3-1-8b";

// Very simple bad word filter (expand list as needed)
const bannedWords = ["fuck", "shit", "bitch", "sex", "porn", "dick", "pussy", "ass", "decent-ass"];

function cleanText(text) {
  let cleaned = text;
  for (const word of bannedWords) {
    const regex = new RegExp(word, "gi");
    cleaned = cleaned.replace(regex, "****");
  }
  return cleaned;
}

// Check if query is Jumia-related
function isJumiaQuery(text) {
  const jumiaKeywords = [
  // Categories
  "appliances", "phones & tablets", "health & beauty", "home & office",
  "electronics", "fashion", "supermarket", "computing", "baby products",
  "gaming", "musical instruments", "sporting goods", "toys & games",
  "groceries", "tv & audio", "generators & inverters", "mobile accessories",
  "sneakers", "automobile",

  // Promotions & Deals
  "flash sales", "brand festival", "early bird", "xiaomi store",
  "awoof deals", "treasure hunt", "banger deals", "buy 2 pay for 1",
  "earn while you shop", "unlock your deal", "options plenty",

  // Services & Site Features
  "jumia marketplace", "jumia logistics", "jumiapay",
  "seller center", "jumia delivery",

  // User Actions & Account
  "place an order", "payment options", "track an order",
  "cancel an order", "returns & refunds", "wishlist", "my account", "help center",

  // Corporate/Brand Keywords
  "innovation", "convenience", "affordable", "e-commerce africa", "technology",

  // Metrics
  "800+ million visits", "active sellers", "orders 2024", "products", "active consumers"
];
  return keywords.some((kw) => text.toLowerCase().includes(kw));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Bot running...");
  }

  try {
    const message = req.body?.message;
    if (!message || !message.text) {
      return res.status(200).send("No text");
    }

    const userText = message.text;
    const chatId = message.chat.id;

    // Restrict to Jumia-related queries
    if (!isJumiaQuery(userText)) {
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: "I can only answer questions related to Jumia Nigeria. 😊"
      });
      return res.status(200).send("Non-Jumia query filtered");
    }

    // Call Fireworks API (Dobby 8B)
    const response = await axios.post(
      FIREWORKS_API,
      {
        model: MODEL,
        messages: [
          { role: "system", content: "You are Dobby AI, a polite assistant for Jumia Nigeria (jumia.com.ng). Avoid foul or rude language and keep responses professional." },
          { role: "user", content: userText }
        ],
        max_tokens: 200
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    let reply = response.data.choices[0].message.content || "";

    // Clean foul or rude language
    reply = cleanText(reply);

    // Send reply to Telegram
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: reply
    });

    return res.status(200).send("Message processed");
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    return res.status(500).send("Error handling message");
  }
}
