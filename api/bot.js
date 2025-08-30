import axios from "axios";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const FIREWORKS_API = "https://api.fireworks.ai/inference/v1/chat/completions";
const MODEL = "accounts/sentientfoundation-serverless/models/dobby-mini-unhinged-plus-llama-3-1-8b";
const JUMIA_BASE_URL = "https://jumia.com.ng";

// Function to check if question is Jumia-related
function isJumiaRelated(text) {
  const jumiaKeywords = [
    'jumia', 'order', 'delivery', 'shipping', 'product', 'payment', 'refund',
    'return', 'account', 'cart', 'checkout', 'price', 'discount', 'coupon',
    'seller', 'buy', 'purchase', 'item', 'category', 'search', 'track',
    'customer service', 'help', 'support', 'complaint', 'review', 'rating',
    'warranty', 'exchange', 'cancel', 'store', 'shop', 'marketplace', 'online shopping'
  ];
  
  const lowerText = text.toLowerCase();
  return jumiaKeywords.some(keyword => lowerText.includes(keyword));
}

// Get Function
async function getJumiaInfo() {
  // else
  return {
    categories: [
      "Electronics", "Phones & Tablets", "Computing", "Fashion", 
      "Home & Kitchen", "Health & Beauty", "Sports & Fitness", 
      "Baby Products", "Automotive", "Books & Games"
    ],
    services: [
      "Free delivery on orders above ₦15,000",
      "7-day return policy",
      "Secure payment options (Card, USSD, Bank Transfer)",
      "Jumia Pay wallet service",
      "JumiaPay bills payment",
      "Customer protection guarantee"
    ],
    generalInfo: "Jumia Nigeria is the leading online marketplace for electronics, fashion, home items and more with reliable delivery across Nigeria"
  };
}

// Enhanced system prompt
function createSystemPrompt(jumiaInfo) {
  return `You are Dobby AI, a professional customer service representative for Jumia Nigeria (jumia.com.ng).

STRICT GUIDELINES:
1. ONLY answer questions about Jumia Nigeria, online shopping, orders, products, or e-commerce
2. If asked about non-Jumia topics, politely redirect to Jumia matters
3. Always be helpful, polite, and professional
4. Keep responses concise (under 200 words)
5. Use the Jumia information provided to give accurate answers

JUMIA NIGERIA INFORMATION:
Categories: ${jumiaInfo.categories.join(', ')}
Services: ${jumiaInfo.services.join('; ')}
About: ${jumiaInfo.generalInfo}

RESPONSE GUIDELINES:
- Start with a friendly greeting for new conversations
- Provide helpful, accurate information about Jumia
- If you don't know specific details, direct to official Jumia channels
- Always end with asking if there's anything else about Jumia you can help with
- Use emojis sparingly and professionally

IMPORTANT: If the question is NOT about Jumia, shopping, orders, or e-commerce, respond with:
"Hello! I'm Dobby AI, your Jumia Nigeria customer service assistant. I can only help with questions about Jumia.com.ng, orders, products, shopping, and related services. How can I assist you with your Jumia experience today?"`;
}

export default async function handler(req, res) {
  // Handle GET requests for health check
  if (req.method !== "POST") {
    return res.status(200).json({ 
      status: "running", 
      message: "Jumia Customer Service Bot is active" 
    });
  }

  try {
    console.log("Received request body:", JSON.stringify(req.body, null, 2));

    const message = req.body?.message;
    if (!message) {
      console.log("No message in request body");
      return res.status(200).json({ status: "no_message" });
    }

    if (!message.text) {
      console.log("No text in message");
      return res.status(200).json({ status: "no_text" });
    }

    const userText = message.text;
    const chatId = message.chat.id;
    const firstName = message.from?.first_name || "Customer";

    console.log(`Processing message from ${firstName}: ${userText}`);

    // Check if question is Jumia-related
    if (!isJumiaRelated(userText)) {
      const redirectMessage = `Hello ${firstName}! 👋\n\nI'm Wisdom Powered by Dobby AI, your dedicated Jumia Nigeria customer service assistant. I can only help with questions about:\n\n🛍️ Shopping on jumia.com.ng\n📦 Orders and delivery\n💳 Payments and refunds\n📱 Products and categories\n🔧 Account issues\n\nHow can I assist you with your Jumia experience today?`;
      
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: redirectMessage
      });
      
      return res.status(200).json({ status: "redirected" });
    }

    // Get Jumia information
    const jumiaInfo = await getJumiaInfo();

    // Create prompt if
    const systemPrompt = createSystemPrompt(jumiaInfo);

    console.log("Calling Fireworks API...");

    // Call Fireworks API
    const response = await axios.post(
      FIREWORKS_API,
      {
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Customer ${firstName} asks: ${userText}` }
        ],
        max_tokens: 250,
        temperature: 0.7,
        top_p: 0.9
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error("Invalid API response structure");
    }

    const reply = response.data.choices[0].message.content;

    // final response
    const finalReply = `🛍️ **Jumia Nigeria Customer Service**\n\n${reply}\n\n---\n💡 Need more help? Visit: https://jumia.com.ng/customer-service/\n📱 Download the Jumia app for better experience!`;

    console.log("Sending response to Telegram...");

    // Send reply to Telegram
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: finalReply,
      parse_mode: "Markdown"
    });

    console.log("Message sent successfully");
    return res.status(200).json({ status: "success" });

  } catch (error) {
    console.error("Error details:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      stack: error.stack
    });
    
    // Send user-friendly error message
    try {
      const errorMessage = "🙏 I apologize for the technical difficulty. Please try again in a moment.\n\nFor immediate assistance, you can:\n• Visit https://jumia.com.ng/customer-service/\n• Call Jumia customer care\n• Use the Jumia mobile app\n\nThank you for your patience!";
      
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: req.body?.message?.chat?.id,
        text: errorMessage
      });
    } catch (sendError) {
      console.error("Failed to send error message:", sendError.message);
    }
    
    return res.status(500).json({ 
      error: "Internal server error",
      details: error.message 
    });
  }
}
