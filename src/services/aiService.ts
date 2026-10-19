import { GoogleGenAI } from '@google/genai';
import { AffiliateProduct } from '../types/osa';
import { fetchActiveAffiliateProducts } from './osaService';

function getConfiguredGeminiKey(): string {
  const raw = import.meta.env.VITE_GOOGLE_AI_API_KEY as string | undefined;
  if (!raw) return '';
  const cleaned = raw.trim().replace(/^["']+|["']+$/g, '').trim();
  if (
    !cleaned ||
    cleaned === 'your-google-ai-api-key' ||
    cleaned === 'MY_GEMINI_API_KEY' ||
    cleaned.length < 12
  ) {
    return '';
  }
  return cleaned;
}

export function isGoogleAiConfigured(): boolean {
  return Boolean(getConfiguredGeminiKey());
}

/**
 * Standard message reply & draft completion helper.
 */
export async function generateSmartDraftOrReply(params: {
  draftOrTopic: string;
  recentMessages?: { senderName: string; content: string }[];
}): Promise<string> {
  const apiKey = getConfiguredGeminiKey();
  if (!apiKey) {
    throw new Error(
      'Google AI (VITE_GOOGLE_AI_API_KEY) is not configured in this build environment.'
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const contextLines = (params.recentMessages || [])
    .slice(-5)
    .map((m) => `${m.senderName}: ${m.content}`)
    .join('\n');

  const prompt = params.draftOrTopic.trim()
    ? `Improve or complete this OSA chat message concisely and naturally (return only the message text, no quotes):\nDraft: ${params.draftOrTopic.trim()}\n${
        contextLines ? `\nRecent conversation context:\n${contextLines}` : ''
      }`
    : `Suggest a concise, natural, friendly reply for this OSA conversation (return only the reply text, no quotes):\n${
        contextLines || 'Greeting a contact on OSA.'
      }`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
  });

  const output = response.text?.trim();
  if (!output) {
    throw new Error('No response returned from Google Gemini API.');
  }
  return output;
}

export interface ChatMessageItem {
  role: 'user' | 'assistant';
  content: string;
}

function getSmartOfflineReply(lastMessage: string, isBn: boolean): string {
  const clean = lastMessage.toLowerCase();
  if (clean.includes('settings') || clean.includes('সেটিংস')) {
    return isBn
      ? '✅ সেটিংস পেজ খোলার নির্দেশ কার্যকর করা হয়েছে। নিচের নেভিগেশন বার থেকে "Settings" ট্যাবে ক্লিক করুন।'
      : '✅ Executed navigation to Settings. Click the "Settings" tab in the bottom or side navigation.';
  }
  if (clean.includes('chat') || clean.includes('চ্যাট')) {
    return isBn
      ? '✅ চ্যাট পেজ খোলার নির্দেশ কার্যকর করা হয়েছে। "Chats" ট্যাবে আপনার কথোপকথন দেখতে পাবেন।'
      : '✅ Executed navigation to Chats. Switch to the "Chats" tab to view conversations.';
  }
  if (clean.includes('deal') || clean.includes('deals') || clean.includes('শপিং') || clean.includes('ডিল') || clean.includes('কিনব')) {
    return isBn
      ? '✅ ডিল ও অফার পেজ খোলার নির্দেশ কার্যকর করা হয়েছে। "Deals" ট্যাবে ভেরিফাইড মার্চেন্ট অফার রয়েছে।'
      : '✅ Executed navigation to Deals. Switch to the "Deals" tab for verified offers.';
  }
  if (clean.includes('call') || clean.includes('কল')) {
    return isBn
      ? '✅ কল হিস্ট্রি দেখতে "Calls" ট্যাবে যান।'
      : '✅ Switch to the "Calls" tab to view audio and video call history.';
  }
  if (clean.includes('group') || clean.includes('গ্রুপ')) {
    return isBn
      ? '✅ গ্রুপ কনভারসেশন দেখতে "Groups" ট্যাবে যান।'
      : '✅ Switch to the "Groups" tab to view community groups.';
  }
  return isBn
    ? `ধন্যবাদ! আপনার বার্তাটি পেয়েছি ("${lastMessage}"). আমি OSA AI অ্যাপ কন্ট্রোলার ও সহকারী হিসেবে আপনার নির্দেশ পালন করতে প্রস্তুত।`
    : `Thank you for your message ("${lastMessage}"). I am OSA AI, your app controller and assistant, ready to assist with navigation, deals, and Q&A.`;
}

export async function generateConversationalReply(
  messages: ChatMessageItem[],
  userLanguage: 'en' | 'bn' = 'en'
): Promise<string> {
  const apiKey = getConfiguredGeminiKey();
  const lastMessage = messages[messages.length - 1]?.content || '';
  const isBn = userLanguage === 'bn';

  if (!apiKey) {
    return getSmartOfflineReply(lastMessage, isBn);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const formattedHistory = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'OSA AI'}: ${m.content}`)
      .join('\n');

    const systemPrompt = `You are OSA AI, an advanced, friendly, helpful AI assistant and App Controller built into the OSA Digital Platform.
You fluently understand and converse in both Bengali and English.
You can guide users on how to use OSA, navigate features (Chats, Status, Groups, Calls, Deals, Settings, Family Safety), and answer general questions.
Provide clear, accurate, natural, and polite answers. Avoid robotic phrases.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `${systemPrompt}\n\nConversation History:\n${formattedHistory}\n\nOSA AI:`,
    });

    const reply = response.text?.trim();
    if (!reply) {
      return getSmartOfflineReply(lastMessage, isBn);
    }
    return reply;
  } catch {
    return getSmartOfflineReply(lastMessage, isBn);
  }
}

// ============================================================================
// CATALOG-GROUNDED SHOPPING & DEALS ASSISTANT ENGINE
// ============================================================================

export interface ShoppingIntentAnalysis {
  isShoppingIntent: boolean;
  category?: string;
  maxBudget?: number;
  budgetCurrency?: string;
  keywords: string[];
  language: 'bn' | 'en';
}

/**
 * Deterministic shopping intent detection supporting English and Bengali queries.
 * Prevents unnecessary AI queries on ordinary chat.
 */
export function detectShoppingIntent(query: string): ShoppingIntentAnalysis {
  const clean = query.trim().toLowerCase();
  if (!clean) {
    return { isShoppingIntent: false, keywords: [], language: 'en' };
  }

  // Detect language
  const isBengali = /[\u0980-\u09FF]/.test(clean);
  const lang: 'bn' | 'en' = isBengali ? 'bn' : 'en';

  // Shopping trigger vocabulary (Bengali + English)
  const shoppingTriggers = [
    // English triggers
    'buy',
    'purchase',
    'recommend',
    'suggest',
    'best',
    'deal',
    'deals',
    'price',
    'cheap',
    'budget',
    'laptop',
    'phone',
    'smartphone',
    'headphone',
    'earphone',
    'earbuds',
    'watch',
    'smartwatch',
    'camera',
    'blender',
    'gadget',
    'discount',
    'under',
    // Bengali triggers
    'কিনব',
    'কিনতে',
    'সাজেস্ট',
    'পরামর্শ',
    'সেরা',
    'দাম',
    'বাজেট',
    'ডিল',
    'অফার',
    'মোবাইল',
    'ফোন',
    'ল্যাপটপ',
    'হেডফোন',
    'ইয়ারফোন',
    'ঘড়ি',
    'ব্লেন্ডার',
    'টাকার মধ্যে',
  ];

  const hasShoppingTrigger = shoppingTriggers.some((kw) => clean.includes(kw));

  if (!hasShoppingTrigger) {
    return { isShoppingIntent: false, keywords: [], language: lang };
  }

  // Extract budget constraints (e.g. "under 30000", "৳30,000", "30000 টাকা", "under $500")
  let maxBudget: number | undefined;
  let budgetCurrency = 'BDT';

  const bdtMatch = clean.match(/(?:৳|tk|taka|টাকা)?\s*([0-9,]{3,9})\s*(?:৳|tk|taka|টাকা|টাকার)?/i);
  const underMatch = clean.match(/(?:under|below|কম|মধ্যে)\s*(?:৳|tk|\$)?\s*([0-9,]{2,9})/i);
  const usdMatch = clean.match(/\$\s*([0-9,]+)/);

  if (usdMatch) {
    budgetCurrency = 'USD';
    maxBudget = parseFloat(usdMatch[1].replace(/,/g, ''));
  } else if (underMatch) {
    maxBudget = parseFloat(underMatch[1].replace(/,/g, ''));
  } else if (bdtMatch) {
    const rawVal = parseFloat(bdtMatch[1].replace(/,/g, ''));
    if (rawVal > 100) {
      maxBudget = rawVal;
    }
  }

  // Category mapping
  let category: string | undefined;
  if (/laptop|computer|ল্যাপটপ|কম্পিউটার/i.test(clean)) category = 'electronics';
  else if (/phone|smartphone|mobile|ফোন|মোবাইল/i.test(clean)) category = 'electronics';
  else if (/headphone|earphone|earbuds|হেডফোন|ইয়ারফোন/i.test(clean)) category = 'electronics';
  else if (/blender|home|kitchen|ব্লেন্ডার|রান্না|ঘর/i.test(clean)) category = 'home';
  else if (/shirt|dress|shoe|watch|fashion|ঘড়ি|জামা|ফ্যাশন/i.test(clean)) category = 'fashion';
  else if (/book|বই/i.test(clean)) category = 'books';

  // Extract clean search tokens
  const stopWords = new Set([
    'a', 'an', 'the', 'for', 'in', 'under', 'best', 'good', 'find', 'me', 'recommend', 'suggest',
    'একটি', 'ভালো', 'সেরা', 'জন্য', 'কোনটি', 'করো', 'দাও', 'টাকা', 'টাকার', 'মধ্যে', 'কিনা'
  ]);

  const rawTokens = clean.split(/[\s,?.!/\\;:'"()]+/);
  const keywords = rawTokens.filter((t) => t.length > 1 && !stopWords.has(t));

  return {
    isShoppingIntent: true,
    category,
    maxBudget,
    budgetCurrency,
    keywords,
    language: lang,
  };
}

/**
 * Deterministic catalog matcher: queries real active products and ranks by relevance and budget.
 * ZERO invented facts. Only real, approved database records are returned.
 */
export async function searchApprovedCatalog(intent: ShoppingIntentAnalysis): Promise<AffiliateProduct[]> {
  try {
    // 1. Fetch real active products through existing service
    const catalog = await fetchActiveAffiliateProducts({
      category: intent.category,
      limit: 30,
    });

    if (!catalog || catalog.length === 0) {
      return [];
    }

    // 2. Filter & score products based on genuine fields
    const scored = catalog
      .filter((p) => {
        // Enforce stock & approval (availability_status === 'in_stock')
        if (!p.is_approved || p.availability_status !== 'in_stock') return false;
        // Enforce active merchant
        if (!p.merchant || p.merchant.status !== 'active') return false;

        // Enforce budget ceiling safely if specified and currencies match
        if (intent.maxBudget && intent.maxBudget > 0) {
          if (p.currency === intent.budgetCurrency) {
            if (p.current_price > intent.maxBudget) return false;
          }
        }
        return true;
      })
      .map((p) => {
        let score = 0;
        const textToMatch = `${p.title} ${p.description} ${p.category} ${p.merchant?.display_name || ''}`.toLowerCase();

        for (const kw of intent.keywords) {
          if (textToMatch.includes(kw)) score += 3;
        }

        // Prefer products with genuine discounts if relevant
        if (p.original_price && p.original_price > p.current_price) {
          score += 1;
        }

        return { product: p, score };
      })
      .sort((a, b) => b.score - a.score);

    // Return top 3 most relevant products
    return scored.slice(0, 3).map((s) => s.product);
  } catch {
    return [];
  }
}

export interface AssistantShoppingResponse {
  isShopping: boolean;
  explanation: string;
  matchedProducts: AffiliateProduct[];
  cardMessagePayloads: string[];
}

/**
 * Full Shopping Assistant Pipeline:
 * - Detects intent
 * - Searches approved catalog
 * - Generates grounded Gemini reasoning without hallucinating facts
 * - Returns structured response with safe deal card payloads
 */
export async function queryShoppingAssistant(
  userQuery: string,
  userLanguage: 'en' | 'bn' = 'en'
): Promise<AssistantShoppingResponse> {
  const intent = detectShoppingIntent(userQuery);

  if (!intent.isShoppingIntent) {
    return {
      isShopping: false,
      explanation: '',
      matchedProducts: [],
      cardMessagePayloads: [],
    };
  }

  // 1. Fetch genuine approved items from catalog
  const matchedProducts = await searchApprovedCatalog(intent);

  // 2. Fallback if catalog has no matching products
  if (matchedProducts.length === 0) {
    const isBn = intent.language === 'bn' || userLanguage === 'bn';
    const noMatchText = isBn
      ? `আপনার অনুসন্ধানের জন্য এই মুহূর্তে আমাদের ভেরিফাইড মার্চেন্ট ক্যাটালগে কোনো পণ্য স্টকে পাওয়া যায়নি।\n\nপণ্য ক্রয়ের সাধারণ পরামর্শ:\n• অফিশিয়াল ব্র্যান্ড স্টোর ও ওয়ারেন্টি যাচাই করুন।\n• পণ্যটির রিটার্ন ও রিপ্লেসমেন্ট পলিসি দেখে নিন।\n• খুব শিগগিরই নতুন মার্চেন্ট ডিল ক্যাটালগে যুক্ত হবে।`
      : `We couldn't find any approved in-stock deals in our merchant catalog matching your exact request right now.\n\nGeneral Buying Tips:\n• Always check official store warranty and genuine distributor tags.\n• Review merchant return/replacement policies before checkout.\n• Check back shortly as our verified partner deals are regularly refreshed!`;

    return {
      isShopping: true,
      explanation: noMatchText,
      matchedProducts: [],
      cardMessagePayloads: [],
    };
  }

  // 3. Grounded Gemini Prompt: Strictly constrained to genuine catalog items
  const catalogContext = matchedProducts
    .map(
      (p, i) =>
        `[Product ${i + 1}]:\n- ID: ${p.id}\n- Title: ${p.title}\n- Price: ${p.currency} ${p.current_price}${
          p.original_price ? ` (Original: ${p.currency} ${p.original_price})` : ''
        }\n- Merchant: ${p.merchant?.display_name}\n- Availability: ${p.availability_status}\n- Summary: ${p.description || 'Verified item'}`
    )
    .join('\n\n');

  const isBn = intent.language === 'bn' || userLanguage === 'bn';

  const systemInstruction = `You are the OSA Deals & Shopping Assistant.
CRITICAL INTEGRITY RULES:
1. ONLY reference the verified products listed in the APPROVED CATALOG below.
2. NEVER invent, fabricate, or assume any product, price, discount, review count, merchant name, or external link.
3. Keep your advice helpful, concise (2-4 sentences max), and natural in ${isBn ? 'Bengali' : 'English'}.
4. Mention why these specific items fit the user's inquiry: "${userQuery}".
5. Do NOT output raw URLs or markdown links. Deal cards with verified tracked buttons will be rendered automatically below your message.`;

  let explanation = '';
  const apiKey = getConfiguredGeminiKey();

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `${systemInstruction}\n\nAPPROVED CATALOG:\n${catalogContext}\n\nUser Question: ${userQuery}`,
      });
      explanation = response.text?.trim() || '';
    } catch {
      // Deterministic fallback if Gemini is offline/rate-limited
    }
  }

  if (!explanation) {
    explanation = isBn
      ? `আপনার পছন্দের সাথে সামঞ্জস্য রেখে আমাদের ভেরিফাইড পার্টনার স্টোর থেকে নিচের সেরা ডিলগুলো পাওয়া গেছে:`
      : `Based on your request, here are verified matching deals currently in stock from our approved merchant partners:`;
  }

  // 4. Construct safe OSA_PRODUCT_CARD payloads for matched products
  const cardMessagePayloads = matchedProducts.map(
    (p) => `OSA_PRODUCT_CARD:${JSON.stringify(p)}`
  );

  return {
    isShopping: true,
    explanation,
    matchedProducts,
    cardMessagePayloads,
  };
}
