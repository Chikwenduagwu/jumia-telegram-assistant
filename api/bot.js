import axios from "axios";
import * as cheerio from "cheerio";

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
    'warranty', 'exchange', 'cancel', 'store', 'shop', 'marketplace'
  ];
  
  const lowerText = text.toLowerCase();
  return jumiaKeywords.some(keyword => lowerText.includes(keyword)) || 
         lowerText.includes('jumia') ||
         lowerText.includes('shopping') ||
         lowerText.includes('e-commerce');
}

// Function to scan Jumia website for relevant information
async function scanJumiaWebsite(query) {
  try {
    // Scan main page for general info
    const mainPageResponse = await axios.get(JUMIA_BASE_URL, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(mainPageResponse.data);
    
    // Extract relevant information
    const pageInfo = {
      categories: [],
      promotions: [],
      generalInfo: ""
    };
    
    // Extract categories
    $('.flyout-link, .nav-item, .category').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 2) {
        pageInfo.categories.push(text);
      }
    });
    
    // Extract promotional info
    $('.promotion, .banner, .deal').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 5) {
        pageInfo.promotions.push(text);
      }
    });
    
    // Get page title and meta description
    pageInfo.generalInfo = $('title').text() + " " + $('meta[name="description"]').attr('content');
    
    return pageInfo;
  } catch (error) {
    console.log("Website scan error:", error.message);
    return {
      categories: ["Electronics", "Fashion", "Home & Garden", "Health & Beauty", "Sports", "Automotive"],
      promotions: ["Check current deals on Jumia Nigeria"],
      generalInfo: "Jumia Nigeria - Online Shopping for Electronics, Phones, Fashion & more"
    };
  }
}

// Enhanced system prompt with Jumia-specific guidelines
function createSystemPrompt(websiteInfo) {
  return `You are Dobby AI, a dedicated customer service representative for Jumia Nigeria (jumia.com.ng), Nigeria's leading online marketplace.

IMPORTANT GUIDELINES:
1. ONLY answer questions related to Jumia Nigeria, online shopping, e-commerce, or general customer service inquiries
2. If asked about unrelated topics, politely redirect to Jumia-related matters
3. Always maintain a professional, helpful, and friendly tone
4. Use the current website information provided to give accurate answers
5. When you don't have specific information, direct customers to official Jumia channels

CURRENT JUMIA WEBSITE INFO:
- Available Categories: ${websiteInfo.categories.slice(0, 10).join(', ')}
- Current Promotions: ${websiteInfo.promotions.slice(0, 3).join('; ')}
- General Info: ${websiteInfo.generalInfo}

RESPONSE STYLE:
- Always greet customers warmly
- Be concise but informative
- Offer helpful suggestions when possible
- End with "Is there anything else I can help you with regarding Jumia?"
- If the question is not Jumia-related, say: "I'm here to assist with Jumia Nigeria inquiries only. How can I help you with your shopping or orders on jumia.com.ng?"

Remember: You represent Jumia Nigeria's commitment to excellent customer service.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Jumia Customer Service Bot running...");
  }

  try {
    const message = req.body?.message;
    if (!message || !message.text) {
      return res.status(200).send("No text");
    }

    const userText = message.text;
    const chatId = message.chat.id;

    // Check if the question is Jumia-related
    if (!isJumiaRelated(userText)) {
      const redirectMessage = "Hello! 👋 I'm Dobby AI, your Jumia Nigeria customer service assistant. I'm here to help with questions about shopping, orders, products, and services on jumia.com.ng.\n\nHow can I assist you with your Jumia experience today?";
      
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: redirectMessage
      });
      
      return res.status(200).send("Redirected to Jumia topics");
    }

    // Scan Jumia website for current information
    console.log("Scanning Jumia website for current information...");
    const websiteInfo = await scanJumiaWebsite(userText);

    // Create enhanced system prompt with website data
    const systemPrompt = createSystemPrompt(websiteInfo);

    // Call Fireworks API with enhanced prompt
    const response = await axios.post(
      FIREWORKS_API,
      {
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Customer inquiry: ${userText}` }
        ],
        max_tokens: 300,
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices[0].message.content;

    // Add Jumia branding to response
    const brandedReply = `🛍️ **Jumia Nigeria Customer Service**\n\n${reply}\n\n---\n💡 For urgent issues, visit: https://jumia.com.ng/customer-service/\n📱 Download the Jumia app for better shopping experience!`;

    // Send reply to Telegram
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: brandedReply,
      parse_mode: "Markdown"
    });

    return res.status(200).send("Message processed successfully");

  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    
    // Send error message to user
    try {
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: req.body?.message?.chat?.id,
        text: "🙏 I apologize, but I'm experiencing technical difficulties. Please try again in a moment or contact Jumia customer service directly at https://jumia.com.ng/customer-service/"
      });
    } catch (sendError) {
      console.error("Failed to send error message:", sendError.message);
    }
    
    return res.status(500).send("Error handling message");
  }
}
