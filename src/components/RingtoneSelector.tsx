import React, { useEffect, useState } from 'react';
import { Check, Music, Pause, Play, Volume2, X } from 'lucide-react';
import {
  getRingtoneById,
  getSelectedRingtoneId,
  OSA_RINGTONES,
  OSARingtoneId,
  RINGTONE_CHANGED_EVENT,
  saveSelectedRingtoneId,
  stopRingtonePreview,
  subscribeRingtonePreview,
  toggleRingtonePreview,
} from '../services/ringtoneService';

interface RingtoneListProps {
  userId: string;
  onRingtoneChanged?: (ringtoneId: OSARingtoneId) => void;
}

export const RingtoneSelectorList: React.FC<RingtoneListProps> = ({
  userId,
  onRingtoneChanged,
}) => {
  const [selectedId, setSelectedId] = useState<OSARingtoneId>(() =>
    getSelectedRingtoneId(userId)
  );
  const [previewState, setPreviewState] = useState<{
    ringtoneId: OSARingtoneId | null;
    playing: boolean;
  }>({ ringtoneId: null, playing: false });
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(getSelectedRingtoneId(userId));
  }, [userId]);

  useEffect(() => {
    const handleChanged = () => {
      setSelectedId(getSelectedRingtoneId(userId));
    };
    window.addEventListener(RINGTONE_CHANGED_EVENT, handleChanged);
    return () => {
      window.removeEventListener(RINGTONE_CHANGED_EVENT, handleChanged);
    };
  }, [userId]);

  useEffect(() => {
    const unsubscribe = subscribeRingtonePreview((state) => {
      setPreviewState(state);
    });
    return () => {
      unsubscribe();
      // Cleanup: stop any active preview when leaving ringtone settings
      stopRingtonePreview();
    };
  }, []);

  const handleSelect = async (id: OSARingtoneId) => {
    setSelectedId(id);
    const saved = await saveSelectedRingtoneId(userId, id);
    onRingtoneChanged?.(saved);
    const item = getRingtoneById(saved);
    setSavedNotice(`${item.name} saved for incoming Audio & Video Calls`);
    window.setTimeout(() => {
      setSavedNotice((prev) =>
        prev === `${item.name} saved for incoming Audio & Video Calls` ? null : prev
      );
    }, 2400);
  };

  const handlePreviewClick = async (
    e: React.MouseEvent,
    id: OSARingtoneId
  ) => {
    e.stopPropagation();
    await toggleRingtonePreview(id);
  };

  const activeRingtone = getRingtoneById(selectedId);

  return (
    <div className="space-y-4">
      {/* Active Ringtone Summary Card */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Volume2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Active Incoming Call Ringtone
            </p>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {activeRingtone.number} &middot; {activeRingtone.name}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {activeRingtone.subtitle} &middot; Audio &amp; Video Calls
            </p>
          </div>
        </div>

        {previewState.playing && (
          <button
            type="button"
            onClick={() => stopRingtonePreview()}
            className="px-3 py-2 min-h-[38px] rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-semibold shrink-0 inline-flex items-center gap-1.5"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>Stop</span>
          </button>
        )}
      </div>

      {savedNotice && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-4 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2"
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* 20 Built-In OSA Ringtones List */}
      <div
        role="radiogroup"
        aria-label="OSA Ringtones"
        className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden"
      >
        <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            OSA Ringtones (20 Built-In)
          </span>
          <span className="text-[11px] text-slate-400">
            Tap to select &middot; Preview to listen
          </span>
        </div>

        {OSA_RINGTONES.map((item) => {
          const isSelected = selectedId === item.id;
          const isPlayingThis =
            previewState.playing && previewState.ringtoneId === item.id;

          return (
            <div
              key={item.id}
              role="radio"
              aria-checked={isSelected}
              aria-label={`${item.number} ${item.name} - ${item.subtitle}`}
              tabIndex={0}
              onClick={() => handleSelect(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect(item.id);
                }
              }}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600 ${
                isSelected
                  ? 'bg-blue-50/70 dark:bg-blue-950/30'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Radio / Check Indicator */}
                <span
                  aria-hidden="true"
                  className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-300 dark:border-slate-700 bg-transparent'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </span>

                {/* Number Badge */}
                <span className="font-mono-num text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                  {item.number}
                </span>

                {/* Ringtone Name & Description */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold truncate ${
                      isSelected
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {item.name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {item.subtitle}
                  </p>
                </div>
              </div>

              {/* Preview Play / Pause Button */}
              <button
                type="button"
                aria-label={
                  isPlayingThis
                    ? `Pause preview for ${item.name}`
                    : `Preview ${item.name}`
                }
                aria-pressed={isPlayingThis}
                onClick={(e) => handlePreviewClick(e, item.id)}
                className={`px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors ${
                  isPlayingThis
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {isPlayingThis ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Preview</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface RingtoneModalProps {
  isOpen: boolean;
  userId: string;
  onClose: () => void;
}

export const RingtoneModal: React.FC<RingtoneModalProps> = ({
  isOpen,
  userId,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) {
      stopRingtonePreview();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    stopRingtonePreview();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-hidden">
      <div className="w-full max-w-md max-h-dvh-modal rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Fixed Top Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                OSA Ringtones
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Incoming Audio &amp; Video Call Ringtone
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close Ringtone Settings"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Middle Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-6">
          <RingtoneSelectorList userId={userId} />
        </div>

        {/* Fixed Bottom Action Area */}
        <div className="shrink-0 px-5 py-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="w-full sm:w-auto px-6 py-2.5 min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
