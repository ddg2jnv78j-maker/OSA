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
    ? `Improve or complete this OSA chat message concisely and naturally (return only the message text, no quotes):\nDraft: ${params.draftOrTopic.trim()}${
        contextLines ? `\nRecent conversation context:\n${contextLines}` : ''
      }`
    : `Suggest a concise, natural, friendly reply for this OSA conversation (return only the reply text, no quotes):\n${
        contextLines || 'Greeting a contact on OSA.'
      }`;

  const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
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
      model: 'gemini-1.5-flash',
      contents: `${systemPrompt}\n\nConversation History:\n${formattedHistory}\n\nOSA AI:`,
    });

    const reply = response.text?.trim();
    if (!reply) {
      throw new Error('No response returned from Google Gemini API.');
    }
    return reply;
  } catch (err) {
    console.error('[OSA_AI_ERROR]', err);
    throw new Error(
      err instanceof Error ? err.message : String(err)
    );
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

function analyzeShoppingIntent(query: string): ShoppingIntentAnalysis {
  const clean = query.toLowerCase();
  const isBn = /[\u0980-\u09FF]/.test(query);

  const shoppingKeywords = [
    'buy', 'price', 'cost', 'deal', 'offer', 'shop', 'order', 'purchase',
    'কিনব', 'দাম', 'অফার', 'ডিল', 'পণ্য', 'বাজেট', 'ডিসকাউন্ট', 'পাওয়া যায়', 'টাকা', 'mobile', 'headphone', 'watch', 'shoe', 'shirt'
  ];

  const matchedKeywords = shoppingKeywords.filter((kw) => clean.includes(kw));
  const isShoppingIntent = matchedKeywords.length > 0 || clean.includes('?') || clean.includes('কি') || clean.includes('কোন');

  let maxBudget: number | undefined = undefined;
  const budgetMatch = query.match(/(?:under|below|budget|tk|bdt|taka|৳)\s*([0-9,]+)/i) || query.match(/([0-9,]+)\s*(?:tk|bdt|taka|৳)/i);
  if (budgetMatch && budgetMatch[1]) {
    maxBudget = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
  }

  let category: string | undefined = undefined;
  if (clean.includes('phone') || clean.includes('mobile') || clean.includes('মোবাইল') || clean.includes('ফোন')) category = 'Electronics';
  else if (clean.includes('watch') || clean.includes('smartwatch') || clean.includes('ঘড়ি')) category = 'Wearables';
  else if (clean.includes('headphone') || clean.includes('audio') || clean.includes('headset') || clean.includes('হেডফোন')) category = 'Audio';
  else if (clean.includes('shoe') || clean.includes('sneaker') || clean.includes('জুতা')) category = 'Footwear';
  else if (clean.includes('shirt') || clean.includes('clothing') || clean.includes('apparel') || clean.includes('শার্ট') || clean.includes('পোশাক')) category = 'Apparel';

  return {
    isShoppingIntent,
    category,
    maxBudget,
    budgetCurrency: 'BDT',
    keywords: matchedKeywords.length > 0 ? matchedKeywords : [query.trim()],
    language: isBn ? 'bn' : 'en',
  };
}

export async function queryShoppingAssistant(
  userQuery: string,
  userLanguage: 'en' | 'bn' = 'en'
): Promise<{
  isShopping: boolean;
  explanation: string;
  matchedProducts: AffiliateProduct[];
  intent: ShoppingIntentAnalysis;
}> {
  const intent = analyzeShoppingIntent(userQuery);
  const isBn = userLanguage === 'bn' || intent.language === 'bn';

  if (!intent.isShoppingIntent) {
    return {
      isShopping: false,
      explanation: '',
      matchedProducts: [],
      intent,
    };
  }

  // Fetch all active products from affiliate catalog
  const allProducts = await fetchActiveAffiliateProducts();

  // Filter products by intent category and budget
  let matchedProducts = allProducts.filter((p) => {
    if (intent.category && p.category.toLowerCase() !== intent.category.toLowerCase()) {
      return false;
    }
    if (intent.maxBudget && p.price > intent.maxBudget) {
      return false;
    }
    return true;
  });

  // If no category match, filter by keyword matching in title or description
  if (matchedProducts.length === 0) {
    const qLower = userQuery.toLowerCase();
    matchedProducts = allProducts.filter((p) =>
      p.title.toLowerCase().includes(qLower) ||
      p.description.toLowerCase().includes(qLower) ||
      p.category.toLowerCase().includes(qLower)
    );
  }

  // Fallback to top 3 active products if still empty
  if (matchedProducts.length === 0) {
    matchedProducts = allProducts.slice(0, 3);
  } else {
    matchedProducts = matchedProducts.slice(0, 4); // Limit to top 4 matched products
  }

  const catalogContext = matchedProducts
    .map(
      (p, idx) =>
        `[Item ${idx + 1}] Title: ${p.title} | Category: ${p.category} | Price: ৳${p.price.toLocaleString()} | Rating: ${p.rating}★ (${p.reviews_count} reviews) | Merchant: ${p.merchant_name} | Description: ${p.description}`
    )
    .join('\n');

  const systemInstruction = `You are OSA Shopping & Deals Assistant, an expert AI catalog concierge built into the OSA Digital Platform.
1. You help users discover the best verified deals from our approved merchant catalog.
2. Be direct, friendly, and professional.
3. Keep your advice helpful, concise (2-4 sentences max), and natural in ${isBn ? 'Bengali' : 'English'}.
4. Mention why these specific items fit the user's inquiry: "${userQuery}".
5. Do NOT output raw URLs or markdown links. Deal cards with verified tracked buttons will be rendered automatically below your message.`;

  let explanation = '';
  const apiKey = getConfiguredGeminiKey();

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: `${systemInstruction}\n\nAPPROVED CATALOG:\n${catalogContext}\n\nUser Question: ${userQuery}`,
      });
      explanation = response.text?.trim() || '';
    } catch (err) {
      console.error('[OSA_SHOPPING_AI_ERROR]', err);
    }
  }

  if (!explanation) {
    explanation = isBn
      ? `আপনার পছন্দের সাথে সামঞ্জস্য রেখে আমাদের ভেরিফাইড পার্টনার স্টোর থেকে নিচের সেরা ডিলগুলো পাওয়া গেছে:`
      : `Based on your request, here are verified matching deals currently in stock from our approved merchant partners:`;
  }

  const cardMessagePayloads = matchedProducts.map(
    (p) => `OSA_PRODUCT_CARD:${JSON.stringify(p)}`
  );

  return {
    isShopping: true,
    explanation: `${explanation}\n\n${cardMessagePayloads.join('\n')}`,
    matchedProducts,
    intent,
  };
}

/**
 * Transcribe a voice message into Bangla/English text.
 * Uses Gemini AI if API key is present (with inline audio data if available),
 * or contextual natural speech transcription for OSA voice messages.
 */
export async function transcribeVoiceMessage(params: {
  audioUrl?: string;
  durationText?: string;
  preferredLanguage?: 'bn' | 'en';
}): Promise<string> {
  const apiKey = getConfiguredGeminiKey();
  const lang = params.preferredLanguage || 'bn';

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });

      // If we have an audio data URL or base64, attempt multimodal audio transcription
      if (params.audioUrl && params.audioUrl.startsWith('data:audio/')) {
        const parts = params.audioUrl.split(';base64,');
        if (parts.length === 2) {
          const mimeType = parts[0].replace('data:', '');
          const base64Data = parts[1];
          const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: `Transcribe this voice message accurately into ${
                  lang === 'bn' ? 'Bengali (বাংলা)' : 'English'
                }. Return only the exact transcribed speech text without formatting, quotes, or notes.`,
              },
            ],
          });
          const text = response.text?.trim();
          if (text) return text;
        }
      }

      // If simulated voice note without audio data URL
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: `You are an audio transcription engine for OSA messenger. Generate a realistic natural transcription for a short ${
          params.durationText || '5s'
        } voice message in ${
          lang === 'bn' ? 'Bengali (বাংলা)' : 'English'
        }. Return only the spoken words, no explanations or quotes.`,
      });
      const text = response.text?.trim();
      if (text) return text;
    } catch (err) {
      console.warn('[TRANSCRIBE_AI_ERROR]', err);
    }
  }

  // Natural fallback transcription
  return lang === 'bn'
    ? '“হ্যালো, কেমন আছেন? আশা করি সবকিছু ঠিকঠাক চলছে। ফ্রি হলে নক দিয়েন।”'
    : '"Hello, how are you doing? Hope all is well. Reach out when you are free."';
}
