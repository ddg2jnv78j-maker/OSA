import { supabase } from '../lib/supabase';
import { LanguageCode, Message } from '../types/osa';
import { parseLocationChatMessage } from './permissionService';

export type ChatTranslationLanguageCode =
  | 'bn'
  | 'en'
  | 'hi'
  | 'ar'
  | 'es'
  | 'fr'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'ru'
  | 'de'
  | 'it'
  | 'pt'
  | 'tr'
  | 'id'
  | 'ms'
  | 'th'
  | 'vi'
  | 'ne'
  | 'ur'
  | 'fa'
  | 'nl'
  | 'pl'
  | 'off';

export type ActiveTranslationLanguageCode = Exclude<
  ChatTranslationLanguageCode,
  'off'
>;

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
    code: 'zh',
    name: 'Chinese / Mandarin',
    nativeName: '中文 (Chinese / Mandarin)',
    badge: 'ZH',
  },
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語 (Japanese)',
    badge: 'JA',
  },
  {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어 (Korean)',
    badge: 'KO',
  },
  {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский (Russian)',
    badge: 'RU',
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch (German)',
    badge: 'DE',
  },
  {
    code: 'it',
    name: 'Italian',
    nativeName: 'Italiano (Italian)',
    badge: 'IT',
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português (Portuguese)',
    badge: 'PT',
  },
  {
    code: 'tr',
    name: 'Turkish',
    nativeName: 'Türkçe (Turkish)',
    badge: 'TR',
  },
  {
    code: 'id',
    name: 'Indonesian',
    nativeName: 'Bahasa Indonesia (Indonesian)',
    badge: 'ID',
  },
  {
    code: 'ms',
    name: 'Malay',
    nativeName: 'Bahasa Melayu (Malay)',
    badge: 'MS',
  },
  {
    code: 'th',
    name: 'Thai',
    nativeName: 'ไทย (Thai)',
    badge: 'TH',
  },
  {
    code: 'vi',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt (Vietnamese)',
    badge: 'VI',
  },
  {
    code: 'ne',
    name: 'Nepali',
    nativeName: 'नेपाली (Nepali)',
    badge: 'NE',
  },
  {
    code: 'ur',
    name: 'Urdu',
    nativeName: 'اردو (Urdu)',
    badge: 'UR',
  },
  {
    code: 'fa',
    name: 'Persian / Farsi',
    nativeName: 'فارسی (Persian / Farsi)',
    badge: 'FA',
  },
  {
    code: 'nl',
    name: 'Dutch',
    nativeName: 'Nederlands (Dutch)',
    badge: 'NL',
  },
  {
    code: 'pl',
    name: 'Polish',
    nativeName: 'Polski (Polish)',
    badge: 'PL',
  },
  {
    code: 'off',
    name: 'Off (Show Original Only)',
    nativeName: 'Off / বন্ধ (Original Only)',
    badge: 'OFF',
  },
];

const ACTIVE_LANGUAGE_CODES: ActiveTranslationLanguageCode[] = [
  'bn',
  'en',
  'hi',
  'ar',
  'es',
  'fr',
  'zh',
  'ja',
  'ko',
  'ru',
  'de',
  'it',
  'pt',
  'tr',
  'id',
  'ms',
  'th',
  'vi',
  'ne',
  'ur',
  'fa',
  'nl',
  'pl',
];

const VALID_CODES = new Set<ChatTranslationLanguageCode>([
  ...ACTIVE_LANGUAGE_CODES,
  'off',
]);

const STORAGE_KEY_PREFIX = 'osa_chat_translation_lang_';
const STORAGE_KEY_DEFAULT = 'osa_chat_translation_lang_default';
const CACHE_STORAGE_KEY = 'osa_translation_cache_v1';
const MAX_CACHE_ENTRIES = 600;

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
// BUILT-IN 23-LANGUAGE CONVERSATIONAL PHRASEBOOK (Instant 0ms + Offline)
// ============================================================================

type PhraseEntry = Record<ActiveTranslationLanguageCode, string> & {
  aliases?: Partial<Record<ActiveTranslationLanguageCode, string[]>>;
};

const CONVERSATION_PHRASES: PhraseEntry[] = [
  {
    bn: 'তুমি কেমন আছো?',
    en: 'How are you?',
    hi: 'तुम कैसे हो?',
    ar: 'كيف حالك؟',
    es: '¿Cómo estás?',
    fr: 'Comment vas-tu ?',
    zh: '你好吗？',
    ja: 'お元気ですか？',
    ko: '잘 지내세요?',
    ru: 'Как дела?',
    de: 'Wie geht es dir?',
    it: 'Come stai?',
    pt: 'Como você está?',
    tr: 'Nasılsın?',
    id: 'Apa kabar?',
    ms: 'Apa khabar?',
    th: 'สบายดีไหม?',
    vi: 'Bạn khỏe không?',
    ne: 'तपाईंलाई कस्तो छ?',
    ur: 'آپ کیسے ہیں؟',
    fa: 'حال شما چطور است؟',
    nl: 'Hoe gaat het met je?',
    pl: 'Jak się masz?',
    aliases: {
      bn: ['কেমন আছো?', 'আপনি কেমন আছেন?'],
      en: ['how are you', 'how are you doing'],
      hi: ['आप कैसे हैं?', 'कैसे हो?'],
      ko: ['어떻게 지내세요?', '잘 지내?'],
      ja: ['元気ですか？', '元気？'],
      zh: ['最近好吗？'],
    },
  },
  {
    bn: 'আমি ভালো আছি।',
    en: 'I am fine.',
    hi: 'मैं ठीक हूँ।',
    ar: 'أنا بخير.',
    es: 'Estoy bien.',
    fr: 'Je vais bien.',
    zh: '我很好。',
    ja: '私は元気です。',
    ko: '저는 잘 지내요.',
    ru: 'У меня всё хорошо.',
    de: 'Mir geht es gut.',
    it: 'Sto bene.',
    pt: 'Estou bem.',
    tr: 'İyiyim.',
    id: 'Saya baik-baik saja.',
    ms: 'Saya khabar baik.',
    th: 'ฉันสบายดี',
    vi: 'Tôi khỏe.',
    ne: 'म সঞ্চै छु।',
    ur: 'میں ٹھیک ہوں۔',
    fa: 'من خوب هستم.',
    nl: 'Met mij gaat het goed.',
    pl: 'Mam się dobrze.',
    aliases: {
      bn: ['আমি ভালো আছি', 'আমি খুব ভালো আছি', 'আমি খুব ভালো আছি।'],
      en: ['i am fine', "i'm fine", 'i am doing well'],
      ne: ['म सञ्चै छु।', 'म ठीक छु।'],
    },
  },
  {
    bn: 'হ্যালো',
    en: 'Hello',
    hi: 'नमस्ते',
    ar: 'مرحباً',
    es: 'Hola',
    fr: 'Bonjour',
    zh: '你好',
    ja: 'こんにちは',
    ko: '안녕하세요',
    ru: 'Привет',
    de: 'Hallo',
    it: 'Ciao',
    pt: 'Olá',
    tr: 'Merhaba',
    id: 'Halo',
    ms: 'Helo',
    th: 'สวัสดี',
    vi: 'Xin chào',
    ne: 'नमस्कार',
    ur: 'السلام علیکم',
    fa: 'سلام',
    nl: 'Hallo',
    pl: 'Cześć',
    aliases: {
      bn: ['হাই', 'সালাম'],
      en: ['hi', 'hey'],
    },
  },
  {
    bn: 'শুভ সকাল',
    en: 'Good morning',
    hi: 'सुप्रभात',
    ar: 'صباح الخير',
    es: 'Buenos días',
    fr: 'Bonjour',
    zh: '早上好',
    ja: 'おはようございます',
    ko: '좋은 아침입니다',
    ru: 'Доброе утро',
    de: 'Guten Morgen',
    it: 'Buongiorno',
    pt: 'Bom dia',
    tr: 'Günaydın',
    id: 'Selamat pagi',
    ms: 'Selamat pagi',
    th: 'อรุณสวัสดิ์',
    vi: 'Chào buổi sáng',
    ne: 'शुभ प्रभात',
    ur: 'صبح بخیر',
    fa: 'صبح بخیر',
    nl: 'Goedemorgen',
    pl: 'Dzień dobry',
  },
  {
    bn: 'শুভ রাত্রি',
    en: 'Good night',
    hi: 'शुभ रात्रि',
    ar: 'تصبح على خير',
    es: 'Buenas noches',
    fr: 'Bonne nuit',
    zh: '晚安',
    ja: 'おやすみなさい',
    ko: '안녕히 주무세요',
    ru: 'Спокойной ночи',
    de: 'Gute Nacht',
    it: 'Buonanotte',
    pt: 'Boa noite',
    tr: 'İyi geceler',
    id: 'Selamat malam',
    ms: 'Selamat malam',
    th: 'ราตรีสวัสดิ์',
    vi: 'Chúc ngủ ngon',
    ne: 'शुभ रात्री',
    ur: 'شب بخیر',
    fa: 'شب بخیر',
    nl: 'Goedenacht',
    pl: 'Dobranoc',
  },
  {
    bn: 'ধন্যবাদ',
    en: 'Thank you',
    hi: 'धन्यवाद',
    ar: 'شكراً لك',
    es: 'Gracias',
    fr: 'Merci',
    zh: '谢谢',
    ja: 'ありがとうございます',
    ko: '감사합니다',
    ru: 'Спасибо',
    de: 'Danke',
    it: 'Grazie',
    pt: 'Obrigado',
    tr: 'Teşekkür ederim',
    id: 'Terima kasih',
    ms: 'Terima kasih',
    th: 'ขอบคุณ',
    vi: 'Cảm ơn bạn',
    ne: 'धन्यवाद',
    ur: 'شکریہ',
    fa: 'ممنون',
    nl: 'Dank je wel',
    pl: 'Dziękuję',
    aliases: {
      bn: ['অনেক ধন্যবাদ'],
      en: ['thanks', 'thank you very much'],
    },
  },
  {
    bn: 'তুমি কোথায়?',
    en: 'Where are you?',
    hi: 'तुम कहाँ हो?',
    ar: 'أين أنت؟',
    es: '¿Dónde estás?',
    fr: 'Où es-tu ?',
    zh: '你在哪里？',
    ja: 'どこにいますか？',
    ko: '어디에 계세요?',
    ru: 'Где ты?',
    de: 'Wo bist du?',
    it: 'Dove sei?',
    pt: 'Onde você está?',
    tr: 'Neredesin?',
    id: 'Di mana kamu?',
    ms: 'Di mana awak?',
    th: 'คุณอยู่ที่ไหน?',
    vi: 'Bạn đang ở đâu?',
    ne: 'तपाईं कहाँ हुनुहुन्छ?',
    ur: 'آپ کہاں ہیں؟',
    fa: 'کجا هستی؟',
    nl: 'Waar ben je?',
    pl: 'Gdzie jesteś?',
    aliases: {
      bn: ['তুমি কোথায়?'],
    },
  },
  {
    bn: 'তুমি কী করছো?',
    en: 'What are you doing?',
    hi: 'तुम क्या कर रहे हो?',
    ar: 'ماذا تفعل؟',
    es: '¿Qué estás haciendo?',
    fr: 'Que fais-tu ?',
    zh: '你在做什么？',
    ja: '何をしていますか？',
    ko: '무엇을 하고 계세요?',
    ru: 'Что ты делаешь?',
    de: 'Was machst du?',
    it: 'Cosa stai facendo?',
    pt: 'O que você está fazendo?',
    tr: 'Ne yapıyorsun?',
    id: 'Apa yang sedang kamu lakukan?',
    ms: 'Apa yang awak sedang buat?',
    th: 'คุณกำลังทำอะไรอยู่?',
    vi: 'Bạn đang làm gì vậy?',
    ne: 'तपाईं के गर्दै हुनुहुन्छ?',
    ur: 'آپ کیا کر رہے ہیں؟',
    fa: 'چه کار می‌کنی؟',
    nl: 'Wat ben je aan het doen?',
    pl: 'Co robisz?',
  },
  {
    bn: 'আমি এখন ব্যস্ত আছি।',
    en: 'I am busy right now.',
    hi: 'मैं अभी व्यस्त हूँ।',
    ar: 'أنا مشغول الآن.',
    es: 'Estoy ocupado ahora mismo.',
    fr: 'Je suis occupé en ce moment.',
    zh: '我现在很忙。',
    ja: '今忙しいです。',
    ko: '지금 바빠요.',
    ru: 'Я сейчас занят.',
    de: 'Ich bin gerade beschäftigt.',
    it: 'Sono occupato adesso.',
    pt: 'Estou ocupado agora.',
    tr: 'Şu anda meşgulüm.',
    id: 'Saya sedang sibuk sekarang.',
    ms: 'Saya sedang sibuk sekarang.',
    th: 'ตอนนี้ฉันยุ่งอยู่',
    vi: 'Hiện tại tôi đang bận.',
    ne: 'म अहिले व्यस्त छु।',
    ur: 'میں ابھی مصروف ہوں۔',
    fa: 'من الان مشغول هستم.',
    nl: 'Ik ben nu bezet.',
    pl: 'Jestem teraz zajęty.',
  },
  {
    bn: 'পরে কথা বলব।',
    en: 'I will talk to you later.',
    hi: 'बाद में बात करेंगे।',
    ar: 'سأتحدث إليك لاحقاً.',
    es: 'Hablamos luego.',
    fr: 'Je te parlerai plus tard.',
    zh: '稍后聊。',
    ja: 'また後で話しましょう。',
    ko: '나중에 이야기해요.',
    ru: 'Поговорим позже.',
    de: 'Wir sprechen später.',
    it: 'Ci sentiamo dopo.',
    pt: 'Falo com você mais tarde.',
    tr: 'Sonra konuşuruz.',
    id: 'Nanti kita bicara lagi.',
    ms: 'Nanti kita berbual lagi.',
    th: 'ไว้คุยกันใหม่นะ',
    vi: 'Nói chuyện sau nhé.',
    ne: 'पछि कुरा गरौंला।',
    ur: 'بعد میں بات کریں گے۔',
    fa: 'بعداً صحبت می‌کنیم.',
    nl: 'Ik spreek je later.',
    pl: 'Porozmawiamy później.',
  },
  {
    bn: 'দেখা হবে।',
    en: 'See you soon.',
    hi: 'जल्द मिलते हैं।',
    ar: 'أراك قريباً.',
    es: 'Nos vemos pronto.',
    fr: 'À bientôt.',
    zh: '回头见。',
    ja: 'また会いましょう。',
    ko: '곧 만나요.',
    ru: 'До скорой встречи.',
    de: 'Bis bald.',
    it: 'A presto.',
    pt: 'Até breve.',
    tr: 'Yakında görüşürüz.',
    id: 'Sampai jumpa.',
    ms: 'Jumpa lagi.',
    th: 'แล้วพบกันใหม่',
    vi: 'Hẹn gặp lại.',
    ne: 'ফেরि भेटौंला।',
    ur: 'جلد ملتے ہیں۔',
    fa: 'به زودی می‌بینمت.',
    nl: 'Tot snel.',
    pl: 'Do zobaczenia wkrótce.',
  },
];

function normalizeForLookup(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[.!?।؟。！？]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupBuiltInPhrase(
  text: string,
  targetLang: ActiveTranslationLanguageCode
): string | null {
  const norm = normalizeForLookup(text);
  if (!norm) return null;

  for (const entry of CONVERSATION_PHRASES) {
    let matched = false;
    for (const code of ACTIVE_LANGUAGE_CODES) {
      if (normalizeForLookup(entry[code]) === norm) {
        matched = true;
        break;
      }
      const aliasList = entry.aliases?.[code];
      if (aliasList && aliasList.some((a) => normalizeForLookup(a) === norm)) {
        matched = true;
        break;
      }
    }
    if (matched) {
      return entry[targetLang] || null;
    }
  }
  return null;
}

// ============================================================================
// LANGUAGE DETECTION & ELIGIBILITY ACROSS ALL 23 LANGUAGES
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
 * Detects the primary language of a text message across all 23 supported OSA languages.
 */
export function detectMessageLanguage(
  text: string
): ActiveTranslationLanguageCode {
  const clean = text.trim();
  if (!clean) return 'en';

  // 1. Check character scripts first
  let bnCount = 0;
  let devanagariCount = 0;
  let arabicScriptCount = 0;
  let thaiCount = 0;
  let hangulCount = 0;
  let kanaCount = 0;
  let cjkCount = 0;
  let cyrillicCount = 0;
  let latinCount = 0;

  for (const ch of clean) {
    const code = ch.codePointAt(0) || 0;
    if (code >= 0x0980 && code <= 0x09ff) {
      bnCount++;
    } else if (code >= 0x0900 && code <= 0x097f) {
      devanagariCount++;
    } else if (
      (code >= 0x0600 && code <= 0x06ff) ||
      (code >= 0x0750 && code <= 0x077f) ||
      (code >= 0xfb50 && code <= 0xfdff) ||
      (code >= 0xfe70 && code <= 0xfeff)
    ) {
      arabicScriptCount++;
    } else if (code >= 0x0e00 && code <= 0x0e7f) {
      thaiCount++;
    } else if (
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3130 && code <= 0x318f)
    ) {
      hangulCount++;
    } else if (
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff)
    ) {
      kanaCount++;
    } else if (code >= 0x4e00 && code <= 0x9fff) {
      cjkCount++;
    } else if (code >= 0x0400 && code <= 0x04ff) {
      cyrillicCount++;
    } else if (
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a) ||
      (code >= 0x00c0 && code <= 0x024f) ||
      (code >= 0x1e00 && code <= 0x1eff)
    ) {
      latinCount++;
    }
  }

  if (bnCount > 0 && bnCount >= devanagariCount && bnCount >= latinCount * 0.4) {
    return 'bn';
  }
  if (thaiCount > 0 && thaiCount >= latinCount * 0.4) {
    return 'th';
  }
  if (hangulCount > 0 && hangulCount >= latinCount * 0.4) {
    return 'ko';
  }
  if (kanaCount > 0) {
    return 'ja';
  }
  if (cjkCount > 0 && cjkCount >= latinCount * 0.4) {
    return 'zh';
  }
  if (cyrillicCount > 0 && cyrillicCount >= latinCount * 0.4) {
    return 'ru';
  }
  if (devanagariCount > 0 && devanagariCount >= latinCount * 0.4) {
    if (
      /\b(तपाईं|तपाईंलाई|कस्तो|छु|हुन्छ|हुनुहुन्छ|नमस्कार|गरौंला|सञ्चै)\b/.test(clean)
    ) {
      return 'ne';
    }
    return 'hi';
  }
  if (arabicScriptCount > 0 && arabicScriptCount >= latinCount * 0.4) {
    // Distinguish Urdu ('ur'), Persian ('fa'), and Arabic ('ar')
    if (
      /[ٹڈڑںےھ]/.test(clean) ||
      /\b(آپ|کیسے|ہیں|ہوں|ٹھیک|شکریہ|کہاں|مصروف)\b/.test(clean)
    ) {
      return 'ur';
    }
    if (
      /[پچژگ]/.test(clean) ||
      /\b(چطور|هستم|ممنون|شما|کجا|مشغول|می‌کنیم)\b/.test(clean)
    ) {
      return 'fa';
    }
    return 'ar';
  }

  // 2. Latin-script disambiguation
  const lower = clean.toLowerCase();

  // Vietnamese
  if (
    /[ăâđêôơưảẩẫậắằẳẵặẻẽếềểễệỉĩỏốồổỗộớờởỡợủũứừửữựỳỷỹỵ]/i.test(clean) ||
    /\b(xin chào|bạn khỏe không|cảm ơn|chào buổi sáng|tôi khỏe)\b/i.test(lower)
  ) {
    return 'vi';
  }

  // Turkish
  if (
    /[ğışİĞŞ]/.test(clean) ||
    /\b(merhaba|nasılsın|iyiyim|teşekkür|günaydın|neredesin)\b/i.test(lower)
  ) {
    return 'tr';
  }

  // Polish
  if (
    /[ąćęłńśźżĄĆĘŁŃŚŹŻ]/.test(clean) ||
    /\b(cześć|jak się masz|dziękuję|dzień dobry|dobranoc|gdzie jesteś)\b/i.test(
      lower
    )
  ) {
    return 'pl';
  }

  // German
  if (
    /ß/.test(clean) ||
    /\b(wie geht es dir|mir geht es gut|danke|guten morgen|gute nacht|wo bist du|was machst du)\b/i.test(
      lower
    )
  ) {
    return 'de';
  }

  // Spanish
  if (
    /[¿¡ñÑ]/.test(clean) ||
    /\b(hola|cómo estás|estoy bien|gracias|buenos días|buenas noches|dónde estás|qué estás haciendo)\b/i.test(
      lower
    )
  ) {
    return 'es';
  }

  // Portuguese
  if (
    /[ãõÃÕ]/.test(clean) ||
    /\b(olá|como você está|estou bem|obrigado|obrigada|bom dia|boa noite|onde você está)\b/i.test(
      lower
    )
  ) {
    return 'pt';
  }

  // French
  if (
    /\b(bonjour|comment vas-tu|comment ça va|je vais bien|merci|bonne nuit|où es-tu|que fais-tu)\b/i.test(
      lower
    )
  ) {
    return 'fr';
  }

  // Italian
  if (
    /\b(ciao|come stai|sto bene|grazie|buongiorno|buonanotte|dove sei|cosa stai facendo)\b/i.test(
      lower
    )
  ) {
    return 'it';
  }

  // Dutch
  if (
    /\b(hoe gaat het|met mij gaat het goed|dank je wel|goedemorgen|goedenacht|waar ben je)\b/i.test(
      lower
    )
  ) {
    return 'nl';
  }

  // Malay
  if (
    /\b(apa khabar|saya khabar baik|di mana awak|jumpa lagi)\b/i.test(lower)
  ) {
    return 'ms';
  }

  // Indonesian
  if (
    /\b(apa kabar|saya baik-baik saja|terima kasih|selamat pagi|selamat malam|di mana kamu|sampai jumpa)\b/i.test(
      lower
    )
  ) {
    return 'id';
  }

  return 'en';
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
  targetLang: ActiveTranslationLanguageCode,
  sourceText: string
): string {
  return `${targetLang}::${sourceText.trim()}`;
}

export function getCachedTranslation(
  sourceText: string,
  targetLang: ActiveTranslationLanguageCode
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
  targetLang: ActiveTranslationLanguageCode,
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

function toUpstreamLanguageCode(code: string): string {
  if (code === 'zh') return 'zh-CN';
  return code;
}

async function translateViaEdgeFunction(
  text: string,
  sourceLang: string,
  targetLang: ActiveTranslationLanguageCode
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
    if (
      data &&
      typeof data.translatedText === 'string' &&
      data.translatedText.trim()
    ) {
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
  targetLang: ActiveTranslationLanguageCode
): Promise<string | null> {
  const upstreamSource =
    sourceLang === 'auto' ? 'auto' : toUpstreamLanguageCode(sourceLang);
  const upstreamTarget = toUpstreamLanguageCode(targetLang);

  // 1. Fast keyless GTX translation endpoint
  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    const params = new URLSearchParams({
      client: 'gtx',
      sl: upstreamSource,
      tl: upstreamTarget,
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
    const pair = `${
      upstreamSource === 'auto' ? 'en' : upstreamSource
    }|${upstreamTarget}`;
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

  // 1. Check cache & built-in 23-language phrasebook first
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
