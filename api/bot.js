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
  const keywords = [
  "appliances", "phones & tablets", "health & beauty", "home & office",
  "electronics", "fashion", "supermarket", "computing", "baby products",
  "gaming", "musical instruments", "brand festival", "early bird",
  "xiaomi store", "flash sales", "treasure hunt", "awoof deals",
  "jumia delivery", "call to order", "up to 80% off", "buy 2 pay for 1",
  "earn while you shop", "unlock your deal", "jumia", "jumia nigeria",
  "jumia.com.ng", "vendor center", "sell on jumia"
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
