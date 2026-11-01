import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  X,
  Send,
  Users,
  FileText
} from 'lucide-react';

export interface EventData {
  id: string;
  title: string;
  category: 'party' | 'meeting' | 'sports' | 'dinner' | 'trip' | 'gaming';
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  location: string;
  mapsUrl?: string;
  description?: string;
  creatorId: string;
  creatorName: string;
  rsvps: Record<string, { status: 'going' | 'maybe' | 'declined'; name: string; avatarUrl?: string | null }>;
  createdAt: string;
}

interface EventPlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateEvent: (eventData: EventData) => Promise<void>;
  currentUser: {
    id: string;
    full_name: string;
    avatar_url?: string | null;
  };
  language?: string;
}

const CATEGORIES = [
  { id: 'party', label: 'Party & Celebration', bnLabel: 'পার্টি ও উদযাপন', icon: '🎉' },
  { id: 'meeting', label: 'Meeting / Work', bnLabel: 'মিটিং / কাজ', icon: '💼' },
  { id: 'dinner', label: 'Dinner / Food', bnLabel: 'ডিনার / খাবার', icon: '🍽️' },
  { id: 'sports', label: 'Sports / Fitness', bnLabel: 'খেলাধুলা / জিম', icon: '⚽' },
  { id: 'trip', label: 'Trip & Hangout', bnLabel: 'ভ্রমণ / আড্ডা', icon: '🚗' },
  { id: 'gaming', label: 'Gaming Night', bnLabel: 'গেমিং নাইট', icon: '🎮' },
] as const;

export const EventPlannerModal: React.FC<EventPlannerModalProps> = ({
  isOpen,
  onClose,
  onCreateEvent,
  currentUser,
  language = 'en',
}) => {
  const isBn = language === 'bn';

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventData['category']>('party');
  
  // Default to tomorrow 6:00 PM
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [time, setTime] = useState('18:00');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(isBn ? 'ইভেন্টের নাম দিন' : 'Please enter an event title');
      return;
    }
    if (!location.trim()) {
      setError(isBn ? 'লোকেশন বা স্থান উল্লেখ করুন' : 'Please specify a location or venue');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const eventData: EventData = {
        id: 'evt_' + Math.random().toString(36).substring(2, 9),
        title: title.trim(),
        category,
        date,
        time,
        location: location.trim(),
        description: description.trim() || undefined,
        creatorId: currentUser.id,
        creatorName: currentUser.full_name,
        rsvps: {
          [currentUser.id]: {
            status: 'going',
            name: currentUser.full_name,
            avatarUrl: currentUser.avatar_url,
          },
        },
        createdAt: new Date().toISOString(),
      };

      await onCreateEvent(eventData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule event');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                <span>{isBn ? 'ইভেন্ট ও মিটআপ প্ল্যানার' : 'Event Planner & RSVP'}</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </h3>
              <p className="text-[11px] text-slate-400">
                {isBn ? 'আড্ডা বা ইভেন্ট আয়োজন করুন ও আরএসভিপি নিন' : 'Plan meetups with interactive RSVP voting'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-red-400 rounded-xl hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isBn ? 'ইভেন্টের নাম / উপলক্ষ' : 'Event Title / Occasion'} *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isBn ? 'যেমন: উইকেন্ড আড্ডা ও বারবিকিউ' : 'e.g., Weekend Rooftop BBQ'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white focus:outline-none focus:border-violet-500"
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isBn ? 'ক্যাটাগরি' : 'Category'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    category === cat.id
                      ? 'bg-violet-600/30 border-violet-500 text-white shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span className="truncate">{isBn ? cat.bnLabel : cat.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{isBn ? 'তারিখ' : 'Date'}</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-white focus:outline-none focus:border-violet-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{isBn ? 'সময়' : 'Time'}</span>
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-white focus:outline-none focus:border-violet-500"
                required
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>{isBn ? 'স্থান / ভেন্যু' : 'Venue / Location'} *</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={isBn ? 'যেমন: গুলশান লেক পার্ক অথবা গুগল মিট' : 'e.g. City Garden or Google Meet'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-white focus:outline-none focus:border-violet-500"
              required
            />
          </div>

          {/* Note / Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>{isBn ? 'বিবরণ (ঐচ্ছিক)' : 'Description (Optional)'}</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isBn ? 'প্রয়োজনীয় কোনো তথ্য থাকলে লিখুন...' : 'Any details for attendees...'}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
            >
              {isBn ? 'বাতিল' : 'Cancel'}
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-2 active:scale-95 disabled:opacity-50 transition-all"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? (isBn ? 'পোস্ট হচ্ছে...' : 'Creating...') : (isBn ? 'ইভেন্ট কার্ড পাঠান' : 'Post Event Card')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
