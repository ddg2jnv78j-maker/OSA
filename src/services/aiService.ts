import { AffiliateProduct } from '../types/osa';
import { fetchActiveAffiliateProducts } from './osaService';
import { getSupabaseConfig, supabase } from '../lib/supabase';

type OsaAiAction = 'chat' | 'draft' | 'shopping' | 'code';

async function invokeOsaAi(payload: {
  action: OsaAiAction;
  messages?: ChatMessageItem[];
  language?: 'en' | 'bn';
  prompt?: string;
}): Promise<string> {
  const config = getSupabaseConfig();
  if (!config.isConfigured) {
    throw new Error('OSA AI backend is not configured: Supabase URL and anon key are missing.');
  }
  const { data, error } = await supabase.functions.invoke('osa-ai-chat', { body: payload });
  if (error) {
    const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    let detail = '';
    try { detail = (await context?.json?.())?.error || ''; } catch { /* response may not be JSON */ }
    throw new Error(detail || error.message || 'OSA AI backend request failed.');
  }
  if (!data || typeof data.reply !== 'string' || !data.reply.trim()) {
    throw new Error('OSA AI backend returned an empty response.');
  }
  return data.reply.trim();
}

/**
 * Standard message reply & draft completion helper.
 */
export async function generateSmartDraftOrReply(params: {
  draftOrTopic: string;
  recentMessages?: { senderName: string; content: string }[];
}): Promise<string> {
  const contextLines = (params.recentMessages || [])
    .slice(-5)
    .map((m) => `${m.senderName}: ${m.content}`)
    .join('\n');
  const prompt = params.draftOrTopic.trim()
    ? `Improve or complete this OSA chat message concisely and naturally (return only the message text, no quotes):\nDraft: ${params.draftOrTopic.trim()}\n${contextLines ? `\nRecent conversation context:\n${contextLines}` : ''}`
    : `Suggest a concise, natural, friendly reply for this OSA conversation (return only the reply text, no quotes):\n${contextLines || 'Greeting a contact on OSA.'}`;
  return invokeOsaAi({ action: 'draft', prompt });
}


export interface OsaAiCodeProposal {
  path: string;
  message: string;
  content: string;
}

export async function generateCodeChangeProposal(task: string, targetPath: string): Promise<OsaAiCodeProposal> {
  const config = getSupabaseConfig();
  if (!config.isConfigured) throw new Error('Supabase is not configured.');
  const { data: inspected, error: inspectError } = await supabase.functions.invoke('osa-ai-github', {
    body: { action: 'inspect_file', path: targetPath },
  });
  if (inspectError) throw new Error(inspectError.message || 'Could not inspect the current GitHub file.');
  if (!inspected || typeof inspected.content !== 'string' || inspected.readOnly !== true) {
    throw new Error(inspected?.error || 'Could not read the current source file from GitHub.');
  }
  const prompt = [
    'Modify the existing file shown below to satisfy the task. Preserve unrelated functionality and existing project conventions.',
    'Return ONLY JSON with keys path, message, content. The path must be exactly the target path. content must be the complete replacement file.',
    'Do not claim tests ran. Do not add secrets or change authentication, authorization, privacy, permissions, or deployment behavior.',
    `TARGET PATH: ${targetPath}`,
    `TASK: ${task.slice(0, 8000)}`,
    'CURRENT FILE CONTENT:',
    inspected.content.slice(0, 12000),
  ].join('\n\n');
  const raw = await invokeOsaAi({ action: 'code', prompt });
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error('OSA AI did not return a valid code proposal.');
  const proposal = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Partial<OsaAiCodeProposal>;
  if (typeof proposal.path !== 'string' || typeof proposal.message !== 'string' || typeof proposal.content !== 'string') {
    throw new Error('OSA AI code proposal is missing required fields.');
  }
  if (proposal.path !== targetPath) throw new Error('OSA AI proposed a different file than the one requested; no change was applied.');
  if (!proposal.content.trim()) throw new Error(proposal.message || 'OSA AI needs a clearer request before proposing code.');
  if (proposal.content.length > 250000) throw new Error('Proposed source file exceeds the 250 KB safety limit.');
  return { path: proposal.path, message: proposal.message, content: proposal.content };
}

export async function submitApprovedGitHubChange(proposal: OsaAiCodeProposal): Promise<{ pullRequestUrl: string; branch: string }> {
  const config = getSupabaseConfig();
  if (!config.isConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('osa-ai-github', {
    body: { action: 'create_change', path: proposal.path, content: proposal.content, message: proposal.message, confirmed: true },
  });
  if (error) throw new Error(error.message || 'GitHub change request failed.');
  if (!data?.success || typeof data.pullRequestUrl !== 'string') throw new Error(data?.error || 'GitHub change was not created.');
  return { pullRequestUrl: data.pullRequestUrl, branch: data.branch };
}

export interface ChatMessageItem {
  role: 'user' | 'assistant';
  content: string;
}

export async function generateConversationalReply(
  messages: ChatMessageItem[],
  userLanguage: 'en' | 'bn' = 'en'
): Promise<string> {
  return invokeOsaAi({ action: 'chat', messages: messages.slice(-20), language: userLanguage });
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

  // Route shopping only when the user expresses a commercial or product-recommendation intent.
  // A product word alone (e.g. "phone addiction") must not hijack general chat.
  const explicitCommerceIntent = /\b(buy|purchase|shop|shopping|deal|deals|price|cost|cheap|budget|discount|sale|order|where to buy|under|below)\b/i.test(clean)
    || /(কিনব|কিনতে চাই|কেনা|দাম|বাজেট|ডিল|অফার|কোথায় কিনব|টাকার মধ্যে)/.test(clean);
  const productCategoryMention = /\b(laptop|computer|phone|smartphone|mobile|headphones?|earphones?|earbuds|smartwatch|watch|camera|blender|gadget|shirt|dress|shoes?|book)\b/i.test(clean)
    || /(মোবাইল|ফোন|ল্যাপটপ|কম্পিউটার|হেডফোন|ইয়ারফোন|ঘড়ি|ব্লেন্ডার|জামা|জুতা|বই)/.test(clean);
  const explicitProductRecommendation = /\b(recommend|recommendation|suggest|best|top|compare|which|what|find)\b/i.test(clean)
    || /(সেরা|ভালো|কোনটি|কোনটা|সাজেস্ট|পরামর্শ|তুলনা)/.test(clean);
  const hasShoppingTrigger = explicitCommerceIntent
    || (productCategoryMention && explicitProductRecommendation);

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
  try {
    explanation = await invokeOsaAi({
      action: 'shopping',
      language: isBn ? 'bn' : 'en',
      prompt: `${systemInstruction}\n\nAPPROVED CATALOG:\n${catalogContext}\n\nUser Question: ${userQuery}`,
    });
  } catch {
    // Deterministic fallback if the secure AI backend is offline or rate-limited.
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
