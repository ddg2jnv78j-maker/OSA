import { supabase } from '../lib/supabase';
import { LanguageCode, Message } from '../types/osa';
import { parseLocationChatMessage } from './permissionService';

export type ChatTranslationLanguageCode =
  | 'en'
  | 'bn'
  | 'hi'
  | 'ar'
  | 'es'
  | 'fr'
  | 'off';

export interface ChatTranslationLanguageOption {
  code: ChatTranslationLanguageCode;
  name: string;
  nativeName: string;
  badge: string;
}

export const CHAT_TRANSLATION_LANGUAGES: ChatTranslationLanguageOption[] = [
  {
    code: 'bn',
    name: 'Bangla (Bengali)',
    nativeName: 'বাংলা (Bangla)',
    badge: 'বাংলা',
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    badge: 'EN',
  },
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी (Hindi)',
    badge: 'HI',
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية (Arabic)',
    badge: 'AR',
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español (Spanish)',
    badge: 'ES',
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français (French)',
    badge: 'FR',
  },
  {
    code: 'off',
    name: 'Off (Show Original Only)',
    nativeName: 'Off / বন্ধ (Original Only)',
    badge: 'OFF',
  },
];

const VALID_CODES = new Set<ChatTranslationLanguageCode>([
  'en',
  'bn',
  'hi',
  'ar',
  'es',
  'fr',
  'off',
]);

const STORAGE_KEY_PREFIX = 'osa_chat_translation_lang_';
const STORAGE_KEY_DEFAULT = 'osa_chat_translation_lang_default';
const CACHE_STORAGE_KEY = 'osa_translation_cache_v1';
const MAX_CACHE_ENTRIES = 500;

export const CHAT_TRANSLATION_LANG_CHANGED_EVENT =
  'osa-chat-translation-lang-changed';

export function isValidTranslationLang(
  val: unknown
): val is ChatTranslationLanguageCode {
  return (
    typeof val === 'string' &&
    VALID_CODES.has(val as ChatTranslationLanguageCode)
  );
}

export function getTranslationLanguageOption(
  code: ChatTranslationLanguageCode
): ChatTranslationLanguageOption {
  return (
    CHAT_TRANSLATION_LANGUAGES.find((item) => item.code === code) ||
    CHAT_TRANSLATION_LANGUAGES[0]
  );
}

export function getChatTranslationLanguage(
  userId?: string | null,
  fallbackAppLang: LanguageCode = 'en'
): ChatTranslationLanguageCode {
  try {
    if (userId) {
      const userSaved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
      if (isValidTranslationLang(userSaved)) {
        return userSaved;
      }
    }
    const defaultSaved = localStorage.getItem(STORAGE_KEY_DEFAULT);
    if (isValidTranslationLang(defaultSaved)) {
      return defaultSaved;
    }
  } catch {
    // Ignore storage read errors
  }
  return fallbackAppLang === 'bn' ? 'bn' : 'en';
}

export async function saveChatTranslationLanguage(
  userId: string | null | undefined,
  langCode: ChatTranslationLanguageCode
): Promise<ChatTranslationLanguageCode> {
  const validCode: ChatTranslationLanguageCode = isValidTranslationLang(langCode)
    ? langCode
    : 'en';

  try {
    if (userId) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, validCode);
    }
    localStorage.setItem(STORAGE_KEY_DEFAULT, validCode);
    window.dispatchEvent(
      new CustomEvent(CHAT_TRANSLATION_LANG_CHANGED_EVENT, {
        detail: { userId, langCode: validCode },
      })
    );
  } catch {
    // Ignore localStorage write errors
  }

  if (userId) {
    try {
      await supabase.auth.updateUser({
        data: { osa_chat_translation_lang: validCode },
      });
    } catch {
      // Ignore network/auth metadata update error
    }
  }

  return validCode;
}

export async function syncChatTranslationLanguageFromSupabase(
  userId: string,
  profileLanguage?: LanguageCode
): Promise<ChatTranslationLanguageCode> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const metaLang = user?.user_metadata?.osa_chat_translation_lang;
    if (isValidTranslationLang(metaLang)) {
      try {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, metaLang);
        localStorage.setItem(STORAGE_KEY_DEFAULT, metaLang);
        window.dispatchEvent(
          new CustomEvent(CHAT_TRANSLATION_LANG_CHANGED_EVENT, {
            detail: { userId, langCode: metaLang },
          })
        );
      } catch {
        // Ignore
      }
      return metaLang;
    }
  } catch {
    // Ignore
  }
  return getChatTranslationLanguage(userId, profileLanguage || 'en');
}

// ============================================================================
// LANGUAGE DETECTION & ELIGIBILITY
// ============================================================================

const URL_ONLY_REGEX = /^(https?:\/\/[^\s]+)$/i;

/**
 * Determines whether a chat message is eligible for automatic receiver-side text translation.
 * Never translates:
 * - Sender's own outgoing messages
 * - Deleted messages
 * - System / call messages
 * - Image, video, audio, voice, or document attachment messages
 * - Live GPS / remote location card messages
 * - Emoji-only, number-only, or URL-only strings
 */
export function isMessageTranslatable(
  msg: Message,
  currentUserId: string
): boolean {
  if (!msg || msg.sender_id === currentUserId) return false;
  if (msg.is_deleted_for_everyone) return false;
  if (msg.message_type !== 'text') return false;
  if (msg.attachments && msg.attachments.length > 0) return false;

  const text = (msg.content || '').trim();
  if (!text) return false;
  if (URL_ONLY_REGEX.test(text)) return false;
  if (parseLocationChatMessage(text) !== null) return false;
  if (/google\.com\/maps|maps\.google\.com/i.test(text)) return false;

  // Must contain at least one letter from any human script
  if (!/\p{L}/u.test(text)) return false;

  return true;
}

/**
 * Detects the primary language of a text message ('bn', 'hi', 'ar', 'es', 'fr', 'en').
 */
export function detectMessageLanguage(
  text: string
): Exclude<ChatTranslationLanguageCode, 'off'> {
  const clean = text.trim();
  if (!clean) return 'en';

  let bnCount = 0;
  let hiCount = 0;
  let arCount = 0;
  let latinCount = 0;

  for (const ch of clean) {
    const code = ch.codePointAt(0) || 0;
    if (code >= 0x0980 && code <= 0x09ff) {
      bnCount++;
    } else if (code >= 0x0900 && code <= 0x097f) {
      hiCount++;
    } else if (
      (code >= 0x0600 && code <= 0x06ff) ||
      (code >= 0x0750 && code <= 0x077f)
    ) {
      arCount++;
    } else if (
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a) ||
      (code >= 0x00c0 && code <= 0x024f)
    ) {
      latinCount++;
    }
  }

  if (bnCount > 0 && bnCount >= hiCount && bnCount >= arCount && bnCount >= latinCount * 0.4) {
    return 'bn';
  }
  if (hiCount > 0 && hiCount >= bnCount && hiCount >= arCount && hiCount >= latinCount * 0.4) {
    return 'hi';
  }
  if (arCount > 0 && arCount >= bnCount && arCount >= hiCount && arCount >= latinCount * 0.4) {
    return 'ar';
  }

  // Heuristic check for Spanish / French vs English on Latin text
  const lower = clean.toLowerCase();
  if (
    /[¿¡ñ]/i.test(clean) ||
    /\b(hola|cómo estás|estoy bien|gracias|buenos días|buenas noches|dónde estás|qué tal|por favor)\b/i.test(
      lower
    )
  ) {
    return 'es';
  }
  if (
    /\b(bonjour|comment ça va|je vais bien|merci beaucoup|bonsoir|s'il vous plaît|où es-tu)\b/i.test(
      lower
    )
  ) {
    return 'fr';
  }

  return 'en';
}

// ============================================================================
// BUILT-IN CONVERSATIONAL PHRASEBOOK (Instant 0ms + Offline Support)
// ============================================================================

interface PhraseEntry {
  bn: string;
  en: string;
  hi: string;
  ar?: string;
  es?: string;
  fr?: string;
}

const CONVERSATION_PHRASES: PhraseEntry[] = [
  {
    bn: 'তুমি কেমন আছো?',
    en: 'How are you?',
    hi: 'तुम कैसे हो?',
    ar: 'كيف حالك؟',
    es: '¿Cómo estás?',
    fr: 'Comment vas-tu ?',
  },
  {
    bn: 'কেমন আছো?',
    en: 'How are you?',
    hi: 'कैसे हो?',
    ar: 'كيف حالك؟',
    es: '¿Cómo estás?',
    fr: 'Comment ça va ?',
  },
  {
    bn: 'আপনি কেমন আছেন?',
    en: 'How are you?',
    hi: 'आप कैसे हैं?',
    ar: 'كيف حالك؟',
    es: '¿Cómo está usted?',
    fr: 'Comment allez-vous ?',
  },
  {
    bn: 'আমি ভালো আছি।',
    en: 'I am fine.',
    hi: 'मैं ठीक हूँ।',
    ar: 'أنا بخير.',
    es: 'Estoy bien.',
    fr: 'Je vais bien.',
  },
  {
    bn: 'আমি ভালো আছি',
    en: 'I am fine',
    hi: 'मैं ठीक हूँ',
    ar: 'أنا بخير',
    es: 'Estoy bien',
    fr: 'Je vais bien',
  },
  {
    bn: 'আমি খুব ভালো আছি।',
    en: 'I am doing very well.',
    hi: 'मैं बहुत अच्छा हूँ।',
    ar: 'أنا بخير جداً.',
    es: 'Estoy muy bien.',
    fr: 'Je vais très bien.',
  },
  {
    bn: 'হ্যালো',
    en: 'Hello',
    hi: 'नमस्ते',
    ar: 'مرحباً',
    es: 'Hola',
    fr: 'Bonjour',
  },
  {
    bn: 'হাই',
    en: 'Hi',
    hi: 'हाय',
    ar: 'أهلاً',
    es: 'Hola',
    fr: 'Salut',
  },
  {
    bn: 'শুভ সকাল',
    en: 'Good morning',
    hi: 'सुप्रभात',
    ar: 'صباح الخير',
    es: 'Buenos días',
    fr: 'Bonjour',
  },
  {
    bn: 'শুভ রাত্রি',
    en: 'Good night',
    hi: 'शुभ रात्रि',
    ar: 'تصبح على خير',
    es: 'Buenas noches',
    fr: 'Bonne nuit',
  },
  {
    bn: 'শুভ সন্ধ্যা',
    en: 'Good evening',
    hi: 'शुभ संध्या',
    ar: 'مساء الخير',
    es: 'Buenas tardes',
    fr: 'Bonsoir',
  },
  {
    bn: 'ধন্যবাদ',
    en: 'Thank you',
    hi: 'धन्यवाद',
    ar: 'شكراً لك',
    es: 'Gracias',
    fr: 'Merci',
  },
  {
    bn: 'অনেক ধন্যবাদ',
    en: 'Thank you very much',
    hi: 'बहुत-बहुत धन्यवाद',
    ar: 'شكراً جزيلاً',
    es: 'Muchas gracias',
    fr: 'Merci beaucoup',
  },
  {
    bn: 'স্বাগতম',
    en: 'You are welcome',
    hi: 'आपका स्वागत है',
    ar: 'على الرحب والسعة',
    es: 'De nada',
    fr: 'De rien',
  },
  {
    bn: 'তুমি কোথায়?',
    en: 'Where are you?',
    hi: 'तुम कहाँ हो?',
    ar: 'أين أنت؟',
    es: '¿Dónde estás?',
    fr: 'Où es-tu ?',
  },
  {
    bn: 'তুমি কোথায়?',
    en: 'Where are you?',
    hi: 'तुम कहाँ हो?',
    ar: 'أين أنت؟',
    es: '¿Dónde estás?',
    fr: 'Où es-tu ?',
  },
  {
    bn: 'তুমি কী করছো?',
    en: 'What are you doing?',
    hi: 'तुम क्या कर रहे हो?',
    ar: 'ماذا تفعل؟',
    es: '¿Qué estás haciendo?',
    fr: 'Que fais-tu ?',
  },
  {
    bn: 'আমি এখন ব্যস্ত আছি।',
    en: 'I am busy right now.',
    hi: 'मैं अभी व्यस्त हूँ।',
    ar: 'أنا مشغول الآن.',
    es: 'Estoy ocupado ahora mismo.',
    fr: 'Je suis occupé en ce moment.',
  },
  {
    bn: 'পরে কথা বলব।',
    en: 'I will talk to you later.',
    hi: 'बाद में बात करेंगे।',
    ar: 'سأتحدث إليك لاحقاً.',
    es: 'Hablamos luego.',
    fr: 'Je te parlerai plus tard.',
  },
  {
    bn: 'হ্যাঁ',
    en: 'Yes',
    hi: 'हाँ',
    ar: 'نعم',
    es: 'Sí',
    fr: 'Oui',
  },
  {
    bn: 'না',
    en: 'No',
    hi: 'नहीं',
    ar: 'لا',
    es: 'No',
    fr: 'Non',
  },
  {
    bn: 'ঠিক আছে',
    en: 'Okay',
    hi: 'ठीक है',
    ar: 'حسناً',
    es: 'Está bien',
    fr: "D'accord",
  },
  {
    bn: 'দয়া করে আমাকে কল করো।',
    en: 'Please call me.',
    hi: 'कृपया मुझे कॉल करें।',
    ar: 'من فضلك اتصل بي.',
    es: 'Por favor llámame.',
    fr: 'Appelle-moi s’il te plaît.',
  },
  {
    bn: 'দেখা হবে।',
    en: 'See you soon.',
    hi: 'जल्द मिलते हैं।',
    ar: 'أراك قريباً.',
    es: 'Nos vemos pronto.',
    fr: 'À bientôt.',
  },
];

function normalizeForLookup(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[.!?।؟]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupBuiltInPhrase(
  text: string,
  targetLang: Exclude<ChatTranslationLanguageCode, 'off'>
): string | null {
  const norm = normalizeForLookup(text);
  if (!norm) return null;

  for (const entry of CONVERSATION_PHRASES) {
    const candidates = [
      entry.bn,
      entry.en,
      entry.hi,
      entry.ar,
      entry.es,
      entry.fr,
    ].filter((v): v is string => Boolean(v));

    if (candidates.some((c) => normalizeForLookup(c) === norm)) {
      const targetVal = entry[targetLang];
      if (targetVal) return targetVal;
    }
  }
  return null;
}

// ============================================================================
// TWO-LEVEL SAFE TRANSLATION CACHE (In-Memory + localStorage)
// ============================================================================

const memoryCache = new Map<string, string>();
let diskCacheLoaded = false;

function ensureDiskCacheLoaded(): void {
  if (diskCacheLoaded) return;
  diskCacheLoaded = true;
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([k, v]) => {
        if (typeof v === 'string') {
          memoryCache.set(k, v);
        }
      });
    }
  } catch {
    // Ignore corrupted cache
  }
}

function persistDiskCache(): void {
  try {
    const entries = Array.from(memoryCache.entries());
    const trimmed =
      entries.length > MAX_CACHE_ENTRIES
        ? entries.slice(entries.length - MAX_CACHE_ENTRIES)
        : entries;
    const obj: Record<string, string> = {};
    for (const [k, v] of trimmed) {
      obj[k] = v;
    }
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Ignore storage quota errors
  }
}

function makeCacheKey(
  targetLang: Exclude<ChatTranslationLanguageCode, 'off'>,
  sourceText: string
): string {
  return `${targetLang}::${sourceText.trim()}`;
}

export function getCachedTranslation(
  sourceText: string,
  targetLang: Exclude<ChatTranslationLanguageCode, 'off'>
): string | null {
  ensureDiskCacheLoaded();
  const key = makeCacheKey(targetLang, sourceText);
  const hit = memoryCache.get(key);
  if (hit) return hit;

  const phraseHit = lookupBuiltInPhrase(sourceText, targetLang);
  if (phraseHit) {
    memoryCache.set(key, phraseHit);
    return phraseHit;
  }

  return null;
}

function setCachedTranslation(
  sourceText: string,
  targetLang: Exclude<ChatTranslationLanguageCode, 'off'>,
  translatedText: string
): void {
  ensureDiskCacheLoaded();
  const key = makeCacheKey(targetLang, sourceText);
  memoryCache.set(key, translatedText);
  persistDiskCache();
}

// ============================================================================
// ASYNCHRONOUS MULTI-TIER TRANSLATION ENGINE
// ============================================================================

const inFlightRequests = new Map<string, Promise<string | null>>();

async function translateViaEdgeFunction(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('translate-message', {
      body: {
        text,
        sourceLang,
        targetLang,
      },
    });
    if (error) return null;
    if (data && typeof data.translatedText === 'string' && data.translatedText.trim()) {
      return data.translatedText.trim();
    }
  } catch {
    // Edge function not deployed or unreachable; fall through to public endpoint
  }
  return null;
}

async function translateViaPublicEndpoint(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string | null> {
  // 1. Fast keyless GTX translation endpoint
  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    const params = new URLSearchParams({
      client: 'gtx',
      sl: sourceLang || 'auto',
      tl: targetLang,
      dt: 't',
      q: text,
    });
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (res.ok) {
      const json = await res.json();
      const segments = Array.isArray(json?.[0]) ? json[0] : [];
      const combined = segments
        .map((seg: unknown) =>
          Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''
        )
        .join('')
        .trim();
      if (combined) {
        return combined;
      }
    }
  } catch {
    // Fall through to secondary MyMemory endpoint
  }

  // 2. Secondary keyless MyMemory API fallback
  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    const pair = `${sourceLang === 'auto' ? 'en' : sourceLang}|${targetLang}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text
    )}&langpair=${encodeURIComponent(pair)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const json = await res.json();
      const translated = json?.responseData?.translatedText;
      if (typeof translated === 'string' && translated.trim()) {
        return translated.trim();
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Translates a message into the receiver's preferred language without modifying
 * the stored original message. Deduplicates concurrent requests and caches results.
 */
export async function translateChatMessageText(
  sourceText: string,
  targetLang: ChatTranslationLanguageCode
): Promise<{
  status: 'same-language' | 'translated' | 'failed';
  translatedText: string | null;
  detectedSourceLang: string;
}> {
  const clean = sourceText.trim();
  const detectedSourceLang = detectMessageLanguage(clean);

  if (!clean || targetLang === 'off' || detectedSourceLang === targetLang) {
    return {
      status: 'same-language',
      translatedText: null,
      detectedSourceLang,
    };
  }

  // 1. Check cache & built-in phrasebook first
  const cached = getCachedTranslation(clean, targetLang);
  if (cached) {
    if (normalizeForLookup(cached) === normalizeForLookup(clean)) {
      return {
        status: 'same-language',
        translatedText: null,
        detectedSourceLang,
      };
    }
    return {
      status: 'translated',
      translatedText: cached,
      detectedSourceLang,
    };
  }

  // 2. Deduplicate in-flight requests for the same (targetLang, clean)
  const inflightKey = makeCacheKey(targetLang, clean);
  let pendingPromise = inFlightRequests.get(inflightKey);

  if (!pendingPromise) {
    pendingPromise = (async () => {
      // Try Supabase Edge Function first, then keyless translation endpoint
      const viaEdge = await translateViaEdgeFunction(
        clean,
        detectedSourceLang,
        targetLang
      );
      if (viaEdge) {
        setCachedTranslation(clean, targetLang, viaEdge);
        return viaEdge;
      }

      const viaPublic = await translateViaPublicEndpoint(
        clean,
        detectedSourceLang,
        targetLang
      );
      if (viaPublic) {
        setCachedTranslation(clean, targetLang, viaPublic);
        return viaPublic;
      }

      return null;
    })();

    inFlightRequests.set(inflightKey, pendingPromise);
  }

  try {
    const result = await pendingPromise;
    if (!result) {
      return {
        status: 'failed',
        translatedText: null,
        detectedSourceLang,
      };
    }
    if (normalizeForLookup(result) === normalizeForLookup(clean)) {
      return {
        status: 'same-language',
        translatedText: null,
        detectedSourceLang,
      };
    }
    return {
      status: 'translated',
      translatedText: result,
      detectedSourceLang,
    };
  } finally {
    inFlightRequests.delete(inflightKey);
  }
}
