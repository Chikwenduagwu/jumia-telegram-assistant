import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body;

    if (!message || !message.text) {
      return res.status(200).send("No message");
    }

    const chatId = message.chat.id;
    const userText = message.text;

    // 🔑 Fireworks API call
    const response = await axios.post(
      "https://api.fireworks.ai/inference/v1/chat/completions",
      {
        model: "accounts/sentientfoundation-serverless/models/dobby-mini-unhinged-plus-llama-3-1-8b",
        messages: [
          { role: "system", content: "You are a shopping assistant for Jumia Nigeria (https://jumia.com.ng)." },
          { role: "user", content: userText }
        ],
        max_tokens: 300
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.FIREWORKS_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const botReply = response.data.choices?.[0]?.message?.content || "Sorry, I couldn’t understand that.";

    // 🔹 Send reply back to Telegram
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: botReply
    });

    res.status(200).send("Message processed ✅");
  } catch (error) {
    console.error("Bot error:", error.response?.data || error.message);
    res.status(500).send("Internal Server Error");
  }
}
