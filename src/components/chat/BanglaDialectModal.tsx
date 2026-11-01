import React, { useState } from 'react';
import {
  Globe,
  Languages,
  ArrowRightLeft,
  Copy,
  Check,
  Send,
  X,
  Sparkles,
  Volume2,
  BookOpen,
} from 'lucide-react';

export type DialectRegion =
  | 'noakhali'
  | 'chittagong'
  | 'sylhet'
  | 'barisal'
  | 'dhakaiya'
  | 'rajshahi';

interface BanglaDialectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertMessage: (text: string) => void;
  language?: string;
}

const REGION_INFO: Record<
  DialectRegion,
  { nameBn: string; nameEn: string; icon: string; sample: string }
> = {
  noakhali: {
    nameBn: 'নোয়াখালী (হাঁই-আঁই)',
    nameEn: 'Noakhali',
    icon: '🌴',
    sample: 'আঁই তোমারে আঁর অন্তরের ভিতর রাইখছি।',
  },
  chittagong: {
    nameBn: 'চট্টগ্রাম (চাঁটগাঁইয়া)',
    nameEn: 'Chatgaya (Ctg)',
    icon: '🌊',
    sample: 'তুঁই খেন্দে যাইবা বদ্দা? আঁরে এক্কানা কও না!',
  },
  sylhet: {
    nameBn: 'সিলেট (ছিলটি)',
    nameEn: 'Sylheti',
    icon: '🍵',
    sample: 'খিতার খবর ভাই? কাইল বাইত আইতায় নি?',
  },
  barisal: {
    nameBn: 'বরিশাল (মোর-মনু)',
    nameEn: 'Barisali',
    icon: '🛶',
    sample: 'মোরা তোমাগো অনেক মিস হরতে আছি মনু!',
  },
  dhakaiya: {
    nameBn: 'পুরান ঢাকা (ঢাকাইয়া)',
    nameEn: 'Dhakaiya',
    icon: '🍲',
    sample: 'আরে মামা কাচ্চি চড়াইয়া দেও, জমাইয়া খামু!',
  },
  rajshahi: {
    nameBn: 'রাজশাহী / বরেন্দ্র',
    nameEn: 'Rajshahi / North',
    icon: '🥭',
    sample: 'হামরা তো ভালোই আছু গো, তু কোন্টে গেলু?',
  },
};

const COMMON_PHRASES: {
  standardBn: string;
  en: string;
  dialects: Record<DialectRegion, string>;
}[] = [
  {
    standardBn: 'আপনি কেমন আছেন? সব খবর ভালো তো?',
    en: 'How are you doing? Is everything good?',
    dialects: {
      noakhali: 'আন্নে ক্যান আছেন? হগল কিছু ভালা তো?',
      chittagong: 'তুঁই গম আছনি বদ্দা? হগল খবর বালা না?',
      sylhet: 'খিতার খবর ভাই? বালা আছইন নি হখলে?',
      barisal: 'মনু হগলডি ভালো আছো তো? কি খবর মোন?',
      dhakaiya: 'মামা কেমন আছো? কোনো চাপ আছে নাকি?',
      rajshahi: 'তু কেমন আছু গো? হামরা সব খবর ভালাই শুনি।',
    },
  },
  {
    standardBn: 'আমি তোমাকে অনেক ভালোবাসি।',
    en: 'I love you very much.',
    dialects: {
      noakhali: 'আঁই তোমারে আঁর কলিজা দি ভালোবাসি।',
      chittagong: 'আঁই তোয়ারে বেজায় গম পাই বদ্দা।',
      sylhet: 'আমি তোমারে বড় মায়াত বান্ধিয়া লাইছি।',
      barisal: 'মুই তোমারে ম্যালা ভালোহবাসি মনু।',
      dhakaiya: 'আরে জানু, তোমারে ছাইড়া আমার এক পলক চলে না!',
      rajshahi: 'হামি তোমাক খুব ভালোবাচি গো।',
    },
  },
  {
    standardBn: 'তুমি এখন কোথায় যাচ্ছ?',
    en: 'Where are you going right now?',
    dialects: {
      noakhali: 'তুঁই এহন কোইন্নে যাচ্ছ?',
      chittagong: 'তুঁই এহন খেন্দে যর গো?',
      sylhet: 'তুমি অখন কুনাই যারায়?',
      barisal: 'মনু এহন কোন্নে যাও?',
      dhakaiya: 'কোথায় টান দিতেছ মামা?',
      rajshahi: 'তু অখন কোন্টে যাছু গো?',
    },
  },
  {
    standardBn: 'তুমি কি দুপুরের ভাত খেয়েছ?',
    en: 'Have you had your lunch?',
    dialects: {
      noakhali: 'তুঁই কি দুপুরির ভাত খাইছো নি?',
      chittagong: 'তুঁই কি ভাত খাইয়োনি?',
      sylhet: 'তুমি কি খাওন খাইছ নি ভাই?',
      barisal: 'মনু তুমি কি দুপুর বেলা ভাত খাইছো?',
      dhakaiya: 'খাইলাও মামা, পেট ঠাণ্ডা তো দুনিয়া ঠাণ্ডা!',
      rajshahi: 'তু কি দুপাহারে ভাত খালু গো?',
    },
  },
];

// Dictionary rules for dialect conversion
const DIALECT_CONVERSION_RULES: Record<
  DialectRegion,
  { search: RegExp; replace: string }[]
> = {
  noakhali: [
    { search: /আমি/g, replace: 'আঁই' },
    { search: /আমার/g, replace: 'আঁর' },
    { search: /আমাকে/g, replace: 'আঁরে' },
    { search: /তুমি/g, replace: 'তুঁই' },
    { search: /তোমার/g, replace: 'তোঁয়ার' },
    { search: /আপনাকে/g, replace: 'আন্নেরে' },
    { search: /আপনি/g, replace: 'আন্নে' },
    { search: /সব/g, replace: 'হগল' },
    { search: /কোথায়/g, replace: 'কোইন্নে' },
    { search: /কেন/g, replace: 'কিয়ের লাই' },
    { search: /বলুন/g, replace: 'কন' },
    { search: /করব/g, replace: 'করমু' },
    { search: /ভালো/g, replace: 'ভালা' },
  ],
  chittagong: [
    { search: /আমি/g, replace: 'আঁই' },
    { search: /আমার/g, replace: 'আঁর' },
    { search: /তুমি/g, replace: 'তুঁই' },
    { search: /তোমাকে/g, replace: 'তোয়ারে' },
    { search: /কোথায়/g, replace: 'খেন্দে' },
    { search: /কেন/g, replace: 'ক্যাবা' },
    { search: /ভালো/g, replace: 'গম' },
    { search: /ভাই/g, replace: 'বদ্দা' },
    { search: /ভাত/g, replace: 'ভাত' },
    { search: /যাচ্ছ/g, replace: 'যর' },
  ],
  sylhet: [
    { search: /আমি/g, replace: 'আমি' },
    { search: /কোথায়/g, replace: 'কুনাই' },
    { search: /কেমন/g, replace: 'খিতার' },
    { search: /ভালো/g, replace: 'বালা' },
    { search: /সবাই/g, replace: 'হখলে' },
    { search: /বাড়ি/g, replace: 'বাইত' },
    { search: /খাবার/g, replace: 'খাওন' },
    { search: /কেন/g, replace: 'খেনে' },
  ],
  barisal: [
    { search: /আমি/g, replace: 'মুই' },
    { search: /আমরা/g, replace: 'মোরা' },
    { search: /আমাদের/g, replace: 'মোগো' },
    { search: /কোথায়/g, replace: 'কোন্নে' },
    { search: /অনেক/g, replace: 'ম্যালা' },
    { search: /করতে/g, replace: 'হরতে' },
    { search: /ভাই/g, replace: 'মনু' },
    { search: /হয়েছে/g, replace: 'হইছে' },
  ],
  dhakaiya: [
    { search: /বন্ধু|ভাই/g, replace: 'মামা' },
    { search: /খেয়ে নাও/g, replace: 'খায়ালাও' },
    { search: /বলছি/g, replace: 'কইতাছি' },
    { search: /কোথায় যাচ্ছ/g, replace: 'কোথায় টান দিলা' },
    { search: /সমস্যা/g, replace: 'ল্যাফড়া' },
    { search: /টাকা/g, replace: 'মালপানি' },
  ],
  rajshahi: [
    { search: /আমি/g, replace: 'হামি' },
    { search: /আমরা/g, replace: 'হামরা' },
    { search: /তুমি/g, replace: 'তু' },
    { search: /কোথায়/g, replace: 'কোন্টে' },
    { search: /যাচ্ছ/g, replace: 'যাছু' },
    { search: /গেলে/g, replace: 'গেলু' },
    { search: /খেলে/g, replace: 'খালু' },
  ],
};

export const BanglaDialectModal: React.FC<BanglaDialectModalProps> = ({
  isOpen,
  onClose,
  onInsertMessage,
  language = 'en',
}) => {
  const isBn = language === 'bn';

  const [selectedRegion, setSelectedRegion] = useState<DialectRegion>('noakhali');
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'translate' | 'phrasebook'>('translate');

  if (!isOpen) return null;

  const handleConvert = (text: string, region: DialectRegion) => {
    let output = text;
    const rules = DIALECT_CONVERSION_RULES[region];
    if (rules) {
      for (const r of rules) {
        output = output.replace(r.search, r.replace);
      }
    }
    setTranslatedText(output);
  };

  const handleTextChange = (val: string) => {
    setInputText(val);
    handleConvert(val, selectedRegion);
  };

  const handleRegionChange = (reg: DialectRegion) => {
    setSelectedRegion(reg);
    if (inputText) {
      handleConvert(inputText, reg);
    }
  };

  const handleCopy = () => {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleInsert = () => {
    if (!translatedText) return;
    onInsertMessage(translatedText);
    onClose();
  };

  const handleSpeak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'bn-BD';
      window.speechSynthesis.speak(u);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg bg-slate-950 text-white rounded-3xl border border-emerald-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-950/70 via-slate-950 to-teal-950/70 border-b border-emerald-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Languages className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-emerald-200">
                {isBn ? 'আঞ্চলিক বাংলা অনুবাদক ও অভিধান' : 'Bangla Regional Dialect Interpreter'}
              </h3>
              <p className="text-xs text-emerald-400/80">
                {isBn
                  ? 'নোয়াখালী, চট্টগ্রাম, সিলেট, বরিশাল, পুরান ঢাকা ও রাজশাহী'
                  : 'Instant bidirectional translation for 6 regional accents'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-6 pt-3 flex items-center gap-3 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('translate')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'translate'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Languages className="w-4 h-4" />
            <span>{isBn ? 'ইনস্ট্যান্ট অনুবাদক' : 'Live Translator'}</span>
          </button>
          <button
            onClick={() => setActiveTab('phrasebook')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'phrasebook'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>{isBn ? 'জনপ্রিয় আঞ্চলিক কথামালা' : 'Regional Phrasebook'}</span>
          </button>
        </div>

        {activeTab === 'translate' ? (
          <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
            {/* Region Selector Pills */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
                {isBn ? 'কাঙ্ক্ষিত অঞ্চল নির্বাচন করুন' : 'Select Target Regional Dialect'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.keys(REGION_INFO) as DialectRegion[]).map((reg) => {
                  const info = REGION_INFO[reg];
                  return (
                    <button
                      key={reg}
                      type="button"
                      onClick={() => handleRegionChange(reg)}
                      className={`p-2.5 rounded-2xl text-left border transition-all flex items-center gap-2 ${
                        selectedRegion === reg
                          ? 'bg-emerald-950/60 border-emerald-500 text-white ring-1 ring-emerald-500/40'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xl">{info.icon}</span>
                      <div className="truncate">
                        <p className="font-bold text-xs truncate">{info.nameBn}</p>
                        <p className="text-[10px] text-emerald-400 truncate">{info.nameEn}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Standard Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {isBn ? 'প্রমিত বাংলা লিখুন' : 'Input Standard Bangla or Text'}
              </label>
              <textarea
                rows={3}
                value={inputText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder={
                  isBn
                    ? 'যেমন: আমি তোমাকে অনেক ভালোবাসি, তুমি এখন কোথায় যাচ্ছ?'
                    : 'e.g. আমি তোমাকে অনেক ভালোবাসি...'
                }
                className="w-full px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 focus:border-emerald-500 text-white placeholder-slate-500 text-sm focus:outline-none resize-none"
              />
            </div>

            {/* Dialect Result Output */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {REGION_INFO[selectedRegion].nameBn} {isBn ? 'উপভাষায় রূপান্তর' : 'Output'}
                  </span>
                </label>
                {translatedText && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSpeak(translatedText)}
                      className="p-1 text-slate-400 hover:text-emerald-400 rounded-lg"
                      title="Speak"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="p-1 text-slate-400 hover:text-emerald-400 rounded-lg"
                      title="Copy"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 min-h-[90px] flex items-center text-sm font-medium text-emerald-100">
                {translatedText || (
                  <span className="text-slate-500 italic text-xs">
                    {isBn ? 'উপরে টেক্সট লিখলে স্বয়ংক্রিয়ভাবে অনুবাদ তৈরি হবে' : 'Translated dialect will appear here instantly...'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Phrasebook Tab */
          <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
            {COMMON_PHRASES.map((phrase, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5"
              >
                <div className="pb-2 border-b border-slate-800">
                  <h4 className="font-bold text-sm text-white">{phrase.standardBn}</h4>
                  <p className="text-[11px] text-slate-400 italic">{phrase.en}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {(Object.keys(phrase.dialects) as DialectRegion[]).map((reg) => (
                    <div
                      key={reg}
                      onClick={() => {
                        onInsertMessage(phrase.dialects[reg]);
                        onClose();
                      }}
                      className="p-2 rounded-xl bg-slate-950/80 hover:bg-emerald-950/40 border border-slate-800/80 hover:border-emerald-500/40 cursor-pointer transition-all flex items-center justify-between group"
                    >
                      <div>
                        <span className="text-[10px] font-bold text-emerald-400 block">
                          {REGION_INFO[reg].nameBn}
                        </span>
                        <span className="text-slate-200">{phrase.dialects[reg]}</span>
                      </div>
                      <Send className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {activeTab === 'translate' && (
          <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
            >
              {isBn ? 'বাতিল' : 'Cancel'}
            </button>
            <button
              disabled={!translatedText}
              onClick={handleInsert}
              className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 disabled:opacity-40 flex items-center gap-2 transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>{isBn ? 'চ্যাটে পাঠান' : 'Insert into Chat'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
