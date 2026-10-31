import { supabase } from '../lib/supabase';
import { Message } from '../types/osa';

const OFFLINE_QUEUE_KEY = 'osa_offline_message_queue_v1';

export interface QueuedOfflineMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  messageType: string;
  replyToId?: string;
  createdAt: string;
}

export function getOfflineQueue(): QueuedOfflineMessage[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function queueOfflineMessage(msg: Omit<QueuedOfflineMessage, 'id' | 'createdAt'>): QueuedOfflineMessage {
  try {
    const queue = getOfflineQueue();
    const item: QueuedOfflineMessage = {
      ...msg,
      id: 'offline_' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
    };
    queue.push(item);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    return item;
  } catch (err) {
    console.error('Failed to queue offline message:', err);
    throw err;
  }
}

export function removeOfflineMessage(id: string): void {
  try {
    const queue = getOfflineQueue();
    const next = queue.filter((m) => m.id !== id);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
  } catch {}
}

/**
 * Automatically flushes queued offline messages to Supabase when internet reconnects.
 */
export async function syncOfflineMessages(): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  const remaining: QueuedOfflineMessage[] = [];
  for (const item of queue) {
    try {
      const { error } = await supabase.from('messages').insert({
        chat_id: item.chatId,
        sender_id: item.senderId,
        content: item.content,
        message_type: item.messageType || 'text',
        reply_to_id: item.replyToId || null,
        status: 'sent',
      });
      if (error) {
        remaining.push(item);
      } else {
        // Update chat last message
        await supabase
          .from('chats')
          .update({
            last_message_text: item.content.slice(0, 120),
            last_message_at: new Date().toISOString(),
          })
          .eq('id', item.chatId)
          .catch(() => {});
      }
    } catch {
      remaining.push(item);
    }
  }

  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  } catch {}
}

// Listen to online events to trigger auto-sync
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncOfflineMessages().catch(() => {});
  });
}
