import { GoogleGenAI } from '@google/genai';

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
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  const output = response.text?.trim();
  if (!output) {
    throw new Error('No response returned from Google Gemini API.');
  }
  return output;
}
