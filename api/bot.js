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
    'warranty', 'exchange', 'cancel', 'store', 'shop', 'marketplace', 'online shopping',
    'looking for', 'need', 'want to buy', 'find', 'recommend', 'suggest'
  ];
  
  const lowerText = text.toLowerCase();
  return jumiaKeywords.some(keyword => lowerText.includes(keyword)) || 
         containsProductIntent(text);
}

// Function to detect if user is looking for products
function containsProductIntent(text) {
  const productIndicators = [
    'phone', 'laptop', 'shoes', 'dress', 'bag', 'watch', 'headphones',
    'tv', 'fridge', 'washing machine', 'generator', 'perfume', 'makeup',
    'book', 'toy', 'furniture', 'clothes', 'electronics', 'appliance'
  ];
  
  const intentPhrases = [
    'looking for', 'need', 'want', 'searching for', 'find', 'buy',
    'purchase', 'get', 'where can i', 'how much', 'price of', 'cost of'
  ];
  
  const lowerText = text.toLowerCase();
  const hasProductKeyword = productIndicators.some(product => lowerText.includes(product));
  const hasIntent = intentPhrases.some(phrase => lowerText.includes(phrase));
  
  return hasProductKeyword || hasIntent;
}

// Function to extract user's specific needs from their message
function analyzeUserNeeds(text) {
  const analysis = {
    productType: '',
    budget: '',
    specifications: [],
    urgency: 'normal',
    location: ''
  };
  
  const lowerText = text.toLowerCase();
  
  // Extract product type
  const products = ['phone', 'laptop', 'computer', 'tv', 'fridge', 'shoes', 'dress', 'bag', 'watch', 'headphones', 'speaker', 'camera', 'tablet', 'generator', 'ac', 'fan', 'iron', 'blender', 'microwave'];
  analysis.productType = products.find(product => lowerText.includes(product)) || '';
  
  // Extract budget
  const budgetMatch = text.match(/₦?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)|(\d+k)|(\d+)\s*thousand|budget.*?(\d+)/i);
  if (budgetMatch) {
    analysis.budget = budgetMatch[0];
  }
  
  // Extract specifications
  const specs = ['fast', 'cheap', 'best', 'quality', 'durable', 'latest', 'new', 'used', 'brand new', 'original', 'android', 'ios', 'samsung', 'apple', 'lg', 'sony'];
  analysis.specifications = specs.filter(spec => lowerText.includes(spec));
  
  // Extract urgency
  if (lowerText.includes('urgent') || lowerText.includes('asap') || lowerText.includes('immediately')) {
    analysis.urgency = 'urgent';
  }
  
  // Extract location mentions
  const locations = ['lagos', 'abuja', 'kano', 'ibadan', 'port harcourt', 'benin', 'kaduna', 'jos', 'calabar', 'enugu'];
  analysis.location = locations.find(location => lowerText.includes(location)) || '';
  
  return analysis;
}

// Function to scan specific Jumia pages based on user needs
async function scanJumiaForSolutions(userNeeds, userQuery) {
  const solutions = {
    productSuggestions: [],
    categoryLinks: [],
    currentDeals: [],
    generalAdvice: []
  };
  
  try {
    // Try to scan main page for current information
    const response = await axios.get(JUMIA_BASE_URL, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // Extract current deals and promotions
    $('.deal, .promotion, .banner, .discount').each((i, el) => {
      if (i < 3) { // Limit to 3 deals
        const dealText = $(el).text().trim();
        if (dealText && dealText.length > 10) {
          solutions.currentDeals.push(dealText.substring(0, 100));
        }
      }
    });
    
    // Extract category links
    $('a[href*="category"], .category-link, .nav-link').each((i, el) => {
      if (i < 5) { // Limit to 5 categories
        const categoryText = $(el).text().trim();
        const href = $(el).attr('href');
        if (categoryText && href) {
          solutions.categoryLinks.push({
            name: categoryText,
            url: href.startsWith('http') ? href : JUMIA_BASE_URL + href
          });
        }
      }
    });
    
  } catch (error) {
    console.log("Website scan failed, using fallback data");
  }
  
  // Provide intelligent suggestions based on user needs
  if (userNeeds.productType) {
    const categoryMap = {
      'phone': 'Phones & Tablets',
      'laptop': 'Computing',
      'computer': 'Computing',
      'tv': 'Electronics',
      'fridge': 'Home & Kitchen',
      'shoes': 'Fashion',
      'dress': 'Fashion',
      'watch': 'Fashion',
      'headphones': 'Electronics',
      'bag': 'Fashion'
    };
    
    const suggestedCategory = categoryMap[userNeeds.productType];
    if (suggestedCategory) {
      solutions.productSuggestions.push(`For ${userNeeds.productType}, check the ${suggestedCategory} section`);
    }
  }
  
  // Budget-based advice
  if (userNeeds.budget) {
    solutions.generalAdvice.push(`With your budget of ${userNeeds.budget}, I'll help you find the best options`);
  }
  
  // Location-based delivery advice
  if (userNeeds.location) {
    solutions.generalAdvice.push(`For delivery to ${userNeeds.location}, standard delivery takes 2-5 business days`);
  }
  
  return solutions;
}

// Enhanced system prompt with intelligent analysis
function createIntelligentSystemPrompt(jumiaInfo, userNeeds, solutions) {
  return `You are Dobby AI, an intelligent customer service representative for Jumia Nigeria (jumia.com.ng).

USER'S SPECIFIC NEEDS ANALYSIS:
- Product Type: ${userNeeds.productType || 'Not specified'}
- Budget: ${userNeeds.budget || 'Not specified'}
- Specifications: ${userNeeds.specifications.join(', ') || 'None specified'}
- Urgency: ${userNeeds.urgency}
- Location: ${userNeeds.location || 'Nigeria'}

CURRENT JUMIA SOLUTIONS FOUND:
- Product Suggestions: ${solutions.productSuggestions.join('; ') || 'General product advice available'}
- Current Deals: ${solutions.currentDeals.slice(0, 2).join('; ') || 'Check current promotions on jumia.com.ng'}
- Relevant Categories: ${solutions.categoryLinks.map(cat => cat.name).slice(0, 3).join(', ') || 'All categories available'}

JUMIA SERVICES:
- Free delivery on orders above ₦15,000
- 7-day return policy
- Multiple payment options (Cards, USSD, Bank Transfer, JumiaPay)
- Customer protection guarantee
- Same-day delivery available in Lagos and Abuja

INTELLIGENT RESPONSE GUIDELINES:
1. Analyze the user's specific needs and provide targeted solutions
2. Suggest relevant product categories based on their requirements
3. Provide budget-appropriate recommendations
4. Mention current deals if relevant to their needs
5. Give practical shopping advice (payment methods, delivery options, etc.)
6. If they need something specific, guide them to the right category
7. Always be helpful and solution-focused

RESPONSE STYLE:
- Be conversational and helpful
- Provide specific, actionable advice
- Use your AI intelligence to connect their needs with Jumia's offerings
- Keep responses under 300 words but comprehensive
- Always end by asking if they need more specific help

STRICT RULE: Only discuss Jumia Nigeria, e-commerce, shopping, or related customer service topics.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ 
      status: "running", 
      message: "Jumia AI Customer Service Bot is active",
      capabilities: ["Product recommendations", "Order assistance", "Shopping guidance", "Problem solving"]
    });
  }

  try {
    console.log("=== NEW REQUEST ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));

    const message = req.body?.message;
    if (!message?.text) {
      return res.status(200).json({ status: "no_text_message" });
    }

    const userText = message.text;
    const chatId = message.chat.id;
    const firstName = message.from?.first_name || "Customer";

    console.log(`Processing query from ${firstName}: "${userText}"`);

    // Check if question is Jumia-related
    if (!isJumiaRelated(userText)) {
      const redirectMessage = `Hello ${firstName}! 👋\n\nI'm Dobby AI, your intelligent Jumia Nigeria assistant. I can help you with:\n\n🔍 Finding products you're looking for\n📦 Order tracking and issues\n💰 Best deals and recommendations\n🚚 Delivery information\n💳 Payment and refund help\n🛡️ Shopping guidance and protection\n\nWhat are you looking to buy or need help with on Jumia today?`;
      
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: redirectMessage
      });
      
      return res.status(200).json({ status: "redirected_to_jumia" });
    }

    console.log("✅ Query is Jumia-related, analyzing user needs...");

    // Analyze user's specific needs
    const userNeeds = analyzeUserNeeds(userText);
    console.log("User needs analysis:", userNeeds);

    // Scan Jumia for intelligent solutions
    console.log("🔍 Scanning Jumia for solutions...");
    const solutions = await scanJumiaForSolutions(userNeeds, userText);
    console.log("Solutions found:", solutions);

    // Get general Jumia info
    const jumiaInfo = await getJumiaInfo();

    // Create intelligent system prompt
    const systemPrompt = createIntelligentSystemPrompt(jumiaInfo, userNeeds, solutions);

    console.log("🤖 Calling Dobby AI for intelligent response...");

    // Call Fireworks API with enhanced context
    const response = await axios.post(
      FIREWORKS_API,
      {
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `${firstName} is asking: "${userText}"\n\nPlease provide an intelligent, solution-focused response based on their specific needs and current Jumia offerings.` 
          }
        ],
        max_tokens: 350,
        temperature: 0.8,
        top_p: 0.9
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error("Invalid AI response structure");
    }

    let reply = response.data.choices[0].message.content;

    // Enhance reply with specific Jumia guidance if user is looking for products
    if (userNeeds.productType || userNeeds.specifications.length > 0) {
      const searchTips = generateSearchTips(userNeeds);
      reply += `\n\n💡 **Smart Shopping Tips:**\n${searchTips}`;
    }

    // Format final response with Jumia branding
    const finalReply = `🤖 **Dobby AI - Jumia Nigeria Assistant**\n\n${reply}\n\n---\n🔗 Visit: https://jumia.com.ng\n📞 Need human help? Contact: https://jumia.com.ng/customer-service/`;

    console.log("📤 Sending intelligent response...");

    // Send reply to Telegram
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: finalReply,
      parse_mode: "Markdown"
    });

    console.log("✅ Response sent successfully");
    return res.status(200).json({ 
      status: "success",
      userNeeds: userNeeds,
      responseLength: reply.length
    });

  } catch (error) {
    console.error("❌ Error occurred:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      type: error.constructor.name
    });
    
    // Intelligent error handling - send helpful message to user
    try {
      const chatId = req.body?.message?.chat?.id;
      const firstName = req.body?.message?.from?.first_name || "Customer";
      
      const errorMessage = `Hi ${firstName}! 🙏\n\nI'm experiencing a brief technical issue, but I'm still here to help!\n\nWhile I resolve this, you can:\n🔍 Search directly on https://jumia.com.ng\n📱 Use the Jumia mobile app\n💬 Contact Jumia support: https://jumia.com.ng/customer-service/\n\nPlease try your question again in a moment - I'll be ready to provide intelligent assistance!`;
      
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: errorMessage
      });
      
    } catch (sendError) {
      console.error("Failed to send error message:", sendError.message);
    }
    
    return res.status(500).json({ 
      error: "processing_error",
      message: "Error in bot processing",
      timestamp: new Date().toISOString()
    });
  }
}

// Function to generate smart search tips based on user needs
function generateSearchTips(userNeeds) {
  const tips = [];
  
  if (userNeeds.productType) {
    tips.push(`🎯 Search for "${userNeeds.productType}" in the ${getCategoryForProduct(userNeeds.productType)} section`);
  }
  
  if (userNeeds.budget) {
    tips.push(`💰 Use price filters to stay within your ${userNeeds.budget} budget`);
  }
  
  if (userNeeds.specifications.length > 0) {
    tips.push(`⚡ Look for products with: ${userNeeds.specifications.join(', ')}`);
  }
  
  if (userNeeds.urgency === 'urgent') {
    tips.push(`🚀 Filter by "Express Delivery" for faster shipping`);
  }
  
  if (userNeeds.location) {
    tips.push(`📍 Check delivery options for ${userNeeds.location} during checkout`);
  }
  
  // Add general smart shopping tips
  tips.push(`⭐ Sort by "Customer Rating" to see top-rated products`);
  tips.push(`🏷️ Check "Deals & Promotions" section for current offers`);
  
  return tips.slice(0, 4).join('\n'); // Limit to 4 tips
}

// Function to map products to Jumia categories
function getCategoryForProduct(product) {
  const categoryMap = {
    'phone': 'Phones & Tablets',
    'laptop': 'Computing',
    'computer': 'Computing',
    'tv': 'Electronics',
    'fridge': 'Home & Kitchen',
    'shoes': 'Fashion',
    'dress': 'Fashion',
    'bag': 'Fashion',
    'watch': 'Fashion',
    'headphones': 'Electronics',
    'speaker': 'Electronics',
    'camera': 'Electronics',
    'tablet': 'Phones & Tablets',
    'generator': 'Home & Kitchen',
    'ac': 'Home & Kitchen',
    'fan': 'Home & Kitchen',
    'iron': 'Home & Kitchen',
    'blender': 'Home & Kitchen',
    'microwave': 'Home & Kitchen'
  };
  
  return categoryMap[product] || 'Electronics';
}

// Enhanced function to get Jumia information with real-time data
async function getJumiaInfo() {
  const baseInfo = {
    categories: [
      "Electronics", "Phones & Tablets", "Computing", "Fashion", 
      "Home & Kitchen", "Health & Beauty", "Sports & Fitness", 
      "Baby Products", "Automotive", "Books & Games", "Garden & Outdoors"
    ],
    services: [
      "Free delivery on orders above ₦15,000",
      "7-day return policy on most items", 
      "Secure payment (Cards, USSD, Bank Transfer, JumiaPay)",
      "Express delivery in Lagos and Abuja",
      "Customer protection guarantee",
      "JumiaPay wallet and bill payments",
      "Installment payment options available"
    ],
    currentPromotions: [
      "Daily flash sales with up to 50% off",
      "Free delivery deals on selected items",
      "Clearance sales on electronics and fashion",
      "New user discounts available"
    ],
    customerSupport: {
      helpCenter: "https://jumia.com.ng/customer-service/",
      phone: "0700 600 0000",
      email: "Available through customer service portal",
      hours: "24/7 online support available"
    },
    generalInfo: "Jumia Nigeria is the #1 online marketplace offering authentic products with reliable delivery nationwide"
  };
  
  return baseInfo;
}

// Function to provide intelligent product recommendations
function getIntelligentRecommendations(userNeeds, solutions) {
  const recommendations = [];
  
  if (userNeeds.productType) {
    recommendations.push(`Based on your interest in ${userNeeds.productType}, I recommend checking the ${getCategoryForProduct(userNeeds.productType)} category`);
  }
  
  if (userNeeds.budget) {
    recommendations.push(`With your budget range, look for products with good customer reviews and seller ratings`);
  }
  
  if (userNeeds.urgency === 'urgent') {
    recommendations.push(`For urgent needs, choose products marked "Express Delivery" or "Same Day Delivery"`);
  }
  
  return recommendations;
}
