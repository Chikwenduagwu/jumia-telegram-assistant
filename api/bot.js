import axios from "axios";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const FIREWORKS_API = "https://api.fireworks.ai/inference/v1/chat/completions";
const MODEL = "accounts/sentientfoundation-serverless/models/dobby-mini-unhinged-plus-llama-3-1-8b";

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

    // Call Fireworks API (Dobby 8B)
    const response = await axios.post(
      FIREWORKS_API,
      {
        model: MODEL,
        messages: [
          { role: "system", content: "You are Dobby AI, a helpful assistant for Jumia Nigeria's e-commerce website (jumia.com.ng)." },
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

    const reply = response.data.choices[0].message.content;

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
