// ============================================================================
// OSA AI — ChatGPT-Style Real Conversational Assistant & Deals Workbench
// File: src/components/AgentWorkbench.tsx
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  RotateCcw,
  Loader2,
  Sparkles,
  User,
  AlertCircle,
  ShoppingBag,
  RefreshCw,
} from 'lucide-react';
import { Profile, AffiliateProduct } from '../types/osa';
import { TranslationDictionary } from '../lib/i18n';
import { generateConversationalReply, queryShoppingAssistant, generateCodeChangeProposal, submitApprovedGitHubChange, OsaAiCodeProposal } from '../services/aiService';
import { AffiliateProductCard } from './AffiliateProductCard';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  products?: AffiliateProduct[];
  isError?: boolean;
}

type SafeCodeRoute = { path: string; matches: RegExp; label: string };

// Only route clear implementation requests to existing, allowlisted source files.
// Unsupported or security-sensitive requests remain ordinary chat instead of guessing a target.
function inferSafeCodeRoute(request: string): SafeCodeRoute | null {
  const text = request.toLowerCase();
  const asksForImplementation = /\b(add|build|create|implement|fix|change|update|make|code|develop|integrate|enable|support)\b|যোগ কর|তৈরি কর|বানাও|নির্মাণ কর|ঠিক কর|পরিবর্তন কর|সংশোধন কর|ইমপ্লিমেন্ট|ফিচার যোগ|কাজ করুক|কাজ করতে পারে/i.test(text);
  if (!asksForImplementation) return null;

  const routes: SafeCodeRoute[] = [
    { path: 'src/components/AgentWorkbench.tsx', label: 'OSA AI interface and app actions', matches: /agent|osa ai|chat interface|chat ui|voice typing|speech.?to.?text|কথা বলে লিখ|ভয়েস টাইপ|ভয়েস টাইপ|কথা থেকে লেখা|চ্যাট|চ্যাটবট|এজেন্ট|সেটিংস|থিম|ভাষা|ড্যাশবোর্ড/i },
    { path: 'src/services/aiService.ts', label: 'AI service and request routing', matches: /ai service|api call|request routing|prompt|gemini|shopping assistant|ডিল|শপিং|এআই সার্ভিস|প্রম্পট|জেমিনি/i },
    { path: 'src/components/AgentWorkbench.tsx', label: 'OSA app user interface', matches: /button|screen|page|interface|ui|layout|design|বাটন|স্ক্রিন|পেজ|ইন্টারফেস|ডিজাইন/i },
  ];
  return routes.find((route) => route.matches.test(text)) || null;
}

interface AgentWorkbenchProps {
  currentUser: Profile;
  t: TranslationDictionary;
  onAppAction?: (action: 'open_settings' | 'open_chats' | 'open_groups' | 'open_status' | 'open_notifications' | 'open_deals' | 'open_calls' | 'theme_dark' | 'theme_light' | 'language_bn' | 'language_en') => string | undefined;
}

export const AgentWorkbench: React.FC<AgentWorkbenchProps> = ({ currentUser, t, onAppAction }) => {
  const isBn = currentUser.language === 'bn';
  const initialGreeting = isBn
    ? 'হ্যালো! আমি OSA AI। আজ আপনাকে কীভাবে সাহায্য করতে পারি? (যেকোনো প্রশ্ন করুন কিংবা বাংলা বা ইংরেজিতে ডিল ও শপিং পরামর্শ চান!)'
    : 'Hello! I am OSA AI. How can I help you today? (Ask me anything or request product deals in English or Bengali!)';

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg_init',
      role: 'assistant',
      content: initialGreeting,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingCodeChange, setPendingCodeChange] = useState<OsaAiCodeProposal | null>(null);
  const [isApplyingCodeChange, setIsApplyingCodeChange] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  const handleNewChat = () => {
    setMessages([
      {
        id: 'msg_' + Math.random().toString(36).substring(2, 9),
        role: 'assistant',
        content: initialGreeting,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setErrorMessage(null);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : input).trim();
    if (!text || isSending) return;

    const userMsg: ChatMessage = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (textToSend === undefined) setInput('');
    setIsSending(true);
    setErrorMessage(null);

    try {
      const lang = isBn ? 'bn' : 'en';

      // Natural-language app actions use a fixed allowlist; model output never selects action names.
      const normalizedCommand = text.toLowerCase().trim();
      const appCommandRules: Array<{ action: NonNullable<AgentWorkbenchProps['onAppAction']> extends (action: infer A) => string | undefined ? A : never; pattern: RegExp }> = [
        { action: 'open_settings', pattern: /(?:\b(?:open|show|go to|take me to)\s+settings\b|settings\s+(?:please\s+)?(?:open|show)\b|সেটিংস\s*(?:খুলে দাও|খুলুন|দেখাও|এ যাও|এ নিয়ে যাও|এ নিয়ে চলো)|আমাকে\s+সেটিংসে\s*(?:নিয়ে যাও|নিয়ে চলো))/i },
        { action: 'open_chats', pattern: /(?:\b(?:open|show|go to)\s+chats?\b|চ্যাট\s*(?:খুলে দাও|খুলুন|দেখাও|এ যাও)|মেসেজ\s*(?:খুলে দাও|দেখাও))/i },
        { action: 'open_groups', pattern: /(?:\b(?:open|show|go to)\s+groups?\b|গ্রুপ\s*(?:খুলে দাও|খুলুন|দেখাও|এ যাও))/i },
        { action: 'open_status', pattern: /(?:\b(?:open|show|go to)\s+status\b|স্ট্যাটাস\s*(?:খুলে দাও|খুলুন|দেখাও|এ যাও))/i },
        { action: 'open_notifications', pattern: /(?:\b(?:open|show|check)\s+notifications?\b|নোটিফিকেশন\s*(?:খুলে দাও|খুলুন|দেখাও|চেক করো))/i },
        { action: 'open_deals', pattern: /(?:\b(?:open|show|go to)\s+deals\b|ডিল\s*(?:খুলে দাও|খুলুন|দেখাও))/i },
        { action: 'open_calls', pattern: /(?:\b(?:open|show|go to)\s+calls?\b|কল\s*(?:খুলে দাও|খুলুন|দেখাও|এ যাও))/i },
        { action: 'theme_dark', pattern: /(?:\b(?:enable|turn on|switch to|use)\s+dark mode\b|dark mode\s*(?:on|please)?|ডার্ক মোড\s*(?:চালু করো|করো|দাও))/i },
        { action: 'theme_light', pattern: /(?:\b(?:enable|turn on|switch to|use)\s+light mode\b|light mode\s*(?:on|please)?|লাইট মোড\s*(?:চালু করো|করো|দাও))/i },
        { action: 'language_bn', pattern: /(?:\b(?:switch to|change to|use)\s+bengali\b|বাংলা\s*(?:ভাষা\s*)?(?:করো|চালু করো|দাও)|বাংলায়\s*(?:করো|দাও|চালাও))/i },
        { action: 'language_en', pattern: /(?:\b(?:switch to|change to|use)\s+english\b|ইংরেজি\s*(?:ভাষা\s*)?(?:করো|চালু করো|দাও)|ইংলিশে\s*(?:করো|দাও))/i },
      ];
      const matchedAppCommand = appCommandRules.find(({ pattern }) => pattern.test(normalizedCommand));
      if (matchedAppCommand && onAppAction) {
        const result = onAppAction(matchedAppCommand.action);
        if (result) {
          setMessages((prev) => [...prev, { id: 'ai_' + Math.random().toString(36).slice(2, 9), role: 'assistant', content: result, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
          return;
        }
      }

      // Explicit GitHub task prefix generates a reviewable proposal; it does not write until confirmed.
      if (/^(?:\/github|github:|গিটহাব:|কোড পরিবর্তন:)\s*/i.test(text)) {
        const task = text.replace(/^(?:\/github|github:|গিটহাব:|কোড পরিবর্তন:)\s*/i, '').trim();
        const target = task.match(/^([A-Za-z0-9_./-]+\.(?:tsx?|css|mjs|md)):\s*([\s\S]+)$/);
        if (!target) throw new Error(isBn ? 'ফাইলের path ও কাজ লিখুন। উদাহরণ: /github src/components/AgentWorkbench.tsx: একটি নিরাপদ ফিচার যোগ করো' : 'Include the target file path and task. Example: /github src/components/AgentWorkbench.tsx: add a safe feature');
        const proposal = await generateCodeChangeProposal(target[2].trim(), target[1]);
        setPendingCodeChange(proposal);
        setMessages((prev) => [...prev, { id: 'ai_' + Math.random().toString(36).slice(2, 9), role: 'assistant', content: isBn ? `GitHub পরিবর্তনের খসড়া তৈরি হয়েছে। ফাইল: ${proposal.path}\n\nএটি এখনো GitHub-এ লেখা হয়নি। নিচের Preview দেখে স্পষ্টভাবে অনুমোদন দিলে একটি আলাদা branch ও Pull Request তৈরি হবে; main branch সরাসরি পরিবর্তন হবে না।` : `A GitHub change proposal is ready for review. File: ${proposal.path}\n\nNothing has been written to GitHub yet. Review the preview below; explicit approval will create an isolated branch and pull request, never a direct main-branch change.`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        return;
      }

      // 1. Check if shopping/deals query
      const shoppingRes = await queryShoppingAssistant(text, lang);

      let assistantReply = '';
      let matchedProducts: AffiliateProduct[] = [];

      if (shoppingRes.isShopping) {
        assistantReply = shoppingRes.explanation;
        matchedProducts = shoppingRes.matchedProducts;
      } else {
        // 2. General conversational reply using context history
        const historyForAI = messages.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        }));
        historyForAI.push({ role: 'user', content: text });

        assistantReply = await generateConversationalReply(historyForAI, lang, {
          fullName: currentUser.full_name,
          username: currentUser.username,
        });
      }

      const aiMsg: ChatMessage = {
        id: 'ai_' + Math.random().toString(36).substring(2, 9),
        role: 'assistant',
        content: assistantReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        products: matchedProducts.length > 0 ? matchedProducts : undefined,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: unknown) {
      const errText = err instanceof Error ? err.message : 'Unknown error connecting to OSA AI';
      setErrorMessage(errText);

      const errorMsg: ChatMessage = {
        id: 'err_' + Math.random().toString(36).substring(2, 9),
        role: 'assistant',
        content: isBn
          ? `দুঃখিত, OSA AI backend-এ সমস্যা হয়েছে: ${errText}\nঅনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।`
          : `Sorry, OSA AI encountered a backend error: ${errText}\nPlease try again in a moment.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 py-4 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/25">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                OSA AI
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase">
                Gemini 3.8 Flash
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isBn ? 'আপনার বুদ্ধিমান সহকারী ও ডিল ফাইন্ডার' : 'Your intelligent assistant & deals finder'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNewChat}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors"
            title={isBn ? 'নতুন চ্যাট শুরু করুন' : 'Start New Chat'}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isBn ? 'নতুন চ্যাট' : 'New Chat'}</span>
          </button>
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="max-w-3xl mx-auto space-y-6 w-full">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`w-8 h-8 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                    isUser
                      ? 'bg-blue-600 text-white'
                      : msg.isError
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-800 dark:bg-slate-700 text-blue-400'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div
                  className={`max-w-[82%], md:max-w-[75%] rounded-3xl px-4 md:px-5 py-3.5 text-xs md:text-sm leading-relaxed shadow-xs ${
                    isUser
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : msg.isError
                      ? 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 rounded-tl-sm'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap font-sans">{msg.content}</div>

                  {/* Render matched products / deal cards if any */}
                  {msg.products && msg.products.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400">
                        <ShoppingBag className="w-4 h-4" />
                        <span>{isBn ? 'অনুমোদিত মার্চেন্ট ডিল ও পণ্য:' : 'Verified Merchant Deals:'}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2.5">
                        {msg.products.map((product) => (
                          <div key={product.id} className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-2.5">
                            <AffiliateProductCard product={product} t={t} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div
                    className={`mt-1.5 text-[10px] font-mono ${
                      isUser ? 'text-blue-200 text-right' : 'text-slate-400'
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            );
          })}

          {isSending && (
            <div className="flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-2xl bg-slate-800 text-blue-400 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl rounded-tl-sm px-5 py-4 shadow-xs flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {isBn ? 'OSA AI চিন্তা করছে...' : 'OSA AI is thinking...'}
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Explicit GitHub source-change approval gate */}
      {pendingCodeChange && (
        <div className="mx-3 mb-3 rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 shrink-0">
          <div className="text-sm font-bold text-slate-900 dark:text-white">{isBn ? 'GitHub পরিবর্তন পর্যালোচনা' : 'Review GitHub source change'}</div>
          <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">{pendingCodeChange.message}</div>
          <div className="text-xs font-mono mt-2 break-all">{pendingCodeChange.path}</div>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-950 text-slate-100 p-2 text-[10px] whitespace-pre-wrap">{pendingCodeChange.content}</pre>
          <div className="text-[11px] text-amber-800 dark:text-amber-200 mt-2">{isBn ? 'অনুমোদন দিলে GitHub token-সহ server-side function administrator অনুমতি যাচাই করে নতুন branch/PR তৈরি করবে। Merge বা production deploy হবে না।' : 'Approval sends the proposal to a server-side function that checks administrator access and creates a new branch/PR only. No merge or production deployment.'}</div>
          <div className="flex gap-2 mt-3">
            <button type="button" disabled={isApplyingCodeChange} onClick={async () => {
              setIsApplyingCodeChange(true);
              try {
                const result = await submitApprovedGitHubChange(pendingCodeChange);
                setMessages((prev) => [...prev, { id: 'ai_' + Math.random().toString(36).slice(2, 9), role: 'assistant', content: (isBn ? 'Pull Request তৈরি হয়েছে: ' : 'Pull Request created: ') + result.pullRequestUrl + '\\n' + (isBn ? 'এখন CI ফলাফল ও diff পর্যালোচনা করুন; merge করা হয়নি।' : 'Review the diff and CI results; nothing has been merged.'), timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                setPendingCodeChange(null);
              } catch (err) {
                setErrorMessage(err instanceof Error ? err.message : 'GitHub request failed.');
              } finally { setIsApplyingCodeChange(false); }
            }} className="rounded-xl bg-blue-600 text-white px-3 py-2 text-xs font-bold disabled:opacity-50">{isApplyingCodeChange ? (isBn ? 'তৈরি হচ্ছে…' : 'Creating…') : (isBn ? 'অনুমোদন করে PR তৈরি' : 'Approve & create PR')}</button>
            <button type="button" disabled={isApplyingCodeChange} onClick={() => setPendingCodeChange(null)} className="rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-white px-3 py-2 text-xs font-bold">{isBn ? 'বাতিল' : 'Cancel'}</button>
          </div>
        </div>
      )}

      {/* Suggested Quick Prompts */}
      <div className="px-4 py-2 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xs border-t border-slate-200 dark:border-slate-800 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <span className="text-[11px] font-bold text-slate-400 shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-blue-500" />
            {isBn ? 'প্রস্তাবিত:' : 'Suggestions:'}
          </span>
          {[
            isBn ? 'সেরা স্মার্টফোন ডিল কোনগুলো?' : 'Best smartphone deals under 30000 BDT',
            isBn ? 'OSA অ্যাপ কীভাবে কাজ করে?' : 'How does OSA app work?',
            isBn ? 'একটি সুন্দর ইমেইল ডাফ্ট করে দাও' : 'Write a professional email draft',
          ].map((promptText, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(promptText)}
              disabled={isSending}
              className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap transition-colors disabled:opacity-50"
            >
              {promptText}
            </button>
          ))}
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-3 md:p-4 shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-2.5">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              rows={1}
              placeholder={
                isBn
                  ? 'আপনার প্রশ্ন বা শপিং রিকোয়েস্ট লিখুন (Enter পাঠাতে, Shift+Enter নতুন লাইনে)...'
                  : 'Type your question or shopping request (Enter to send, Shift+Enter for new line)...'
              }
              className="w-full px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs md:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none max-h-32 disabled:opacity-50"
            />
          </div>

          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={!input.trim() || isSending}
            className="w-11 h-11 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center shadow-md shadow-blue-600/25 transition-colors shrink-0"
            title="Send Message"
          >
            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
