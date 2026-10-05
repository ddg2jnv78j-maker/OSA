import React, { useState } from 'react';
import { Users } from 'lucide-react';

interface OSAAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  showOnlineStatus?: boolean;
  isGroup?: boolean;
  hidePhotoForPrivacy?: boolean;
  className?: string;
}

const SIZE_MAP = {
  xs: 'w-8 h-8 text-xs',
  sm: 'w-10 h-10 text-sm',
  md: 'w-12 h-12 text-base',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-24 h-24 text-2xl',
};

const DOT_MAP = {
  xs: 'w-2.5 h-2.5 border',
  sm: 'w-3 h-3 border-2',
  md: 'w-3.5 h-3.5 border-2',
  lg: 'w-4 h-4 border-2',
  xl: 'w-5 h-5 border-2',
};

const PALETTE = [
  'bg-blue-600 text-white',
  'bg-indigo-600 text-white',
  'bg-sky-600 text-white',
  'bg-emerald-600 text-white',
  'bg-teal-600 text-white',
  'bg-slate-700 text-white',
];

export const OSAAvatar: React.FC<OSAAvatarProps> = ({
  name,
  avatarUrl,
  size = 'md',
  isOnline = false,
  showOnlineStatus = false,
  isGroup = false,
  hidePhotoForPrivacy = false,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  const initials = (name || 'OSA')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const colorIndex =
    (name || 'OSA').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % PALETTE.length;

  const shouldRenderImage = Boolean(avatarUrl && !imgError && !hidePhotoForPrivacy);

  return (
    <div className={`relative inline-flex shrink-0 select-none ${className}`}>
      {shouldRenderImage ? (
        <img
          src={avatarUrl!}
          alt={name || 'OSA User'}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${SIZE_MAP[size]} rounded-full object-cover bg-slate-200 dark:bg-slate-800`}
        />
      ) : (
        <div
          className={`${SIZE_MAP[size]} ${PALETTE[colorIndex]} rounded-full flex items-center justify-center font-semibold tracking-tight`}
        >
          {isGroup ? <Users className="w-1/2 h-1/2" /> : initials || 'OS'}
        </div>
      )}

      {showOnlineStatus && (
        <span
          title={isOnline ? 'Online' : 'Offline'}
          className={`absolute bottom-0 right-0 ${DOT_MAP[size]} rounded-full border-white dark:border-slate-900 ${
            isOnline ? 'bg-green-500' : 'bg-slate-400 dark:bg-slate-600'
          }`}
        />
      )}
    </div>
  );
};
