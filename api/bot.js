import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Dobby Jumia Assistant is running ✅");
  }

  const body = req.body;

  if (!body.message || !body.message.text) {
    return res.status(200).send("No message received");
  }

  const chatId = body.message.chat.id;
  const userMessage = body.message.text.toLowerCase();

  let replyText = "";

  // 🔹 Check if message is related to Jumia
  if (userMessage.includes("jumia") || userMessage.includes("order") || userMessage.includes("shop") || userMessage.includes("buy")) {
    // Forward to Dobby AI via Fireworks
    const fwResponse = await fetch(
      "https://api.fireworks.ai/inference/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.FIREWORKS_API_KEY}`,
        },
        body: JSON.stringify({
          model: "accounts/sentientfoundation-serverless/models/dobby-mini-unhinged-plus-llama-3-1-8b",
          messages: [
            { role: "system", content: "You are Dobby AI, a helpful assistant for Jumia Nigeria e-commerce platform. Only answer questions related to Jumia products, shopping, and customer support." },
            { role: "user", content: body.message.text }
          ],
          max_tokens: 300,
        }),
      }
    );

    const fwData = await fwResponse.json();
    replyText =
      fwData?.choices?.[0]?.message?.content ||
      "Sorry, I couldn’t fetch an answer right now.";
  } else {
    // 🔹 Fallback for unrelated questions
    replyText = "I can only help with Jumia Nigeria shopping, products, and orders. Please ask me something related ✅.";
  }

  // Send reply to Telegram
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText,
      }),
    }
  );

  res.status(200).send("OK");
}
