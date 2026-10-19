import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

function extractStorageBucketAndPath(rawUrl: string): {
  bucket: string;
  objectPath: string;
} | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Match Supabase Storage URLs: /storage/v1/object/(public|sign|authenticated)/<bucket>/<path>
  const match = trimmed.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/i
  );
  if (match && match[1] && match[2]) {
    return {
      bucket: decodeURIComponent(match[1]),
      objectPath: decodeURIComponent(match[2]),
    };
  }

  // Relative storage path such as "<userId>/avatar_123.png" or "osa-avatars/<userId>/avatar.png"
  if (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('data:') &&
    !trimmed.startsWith('blob:')
  ) {
    const clean = trimmed.replace(/^\/+/, '');
    if (clean.startsWith('osa-avatars/')) {
      return {
        bucket: 'osa-avatars',
        objectPath: clean.slice('osa-avatars/'.length),
      };
    }
    return {
      bucket: 'osa-avatars',
      objectPath: clean,
    };
  }

  return null;
}

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
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [triedSignedFallback, setTriedSignedFallback] = useState(false);

  useEffect(() => {
    setImgError(false);
    setTriedSignedFallback(false);

    if (!avatarUrl || !avatarUrl.trim()) {
      setResolvedSrc(null);
      return;
    }

    const raw = avatarUrl.trim();
    if (
      raw.startsWith('http://') ||
      raw.startsWith('https://') ||
      raw.startsWith('data:') ||
      raw.startsWith('blob:')
    ) {
      setResolvedSrc(raw);
      return;
    }

    // Relative storage path -> convert to public URL first
    const parsed = extractStorageBucketAndPath(raw);
    if (parsed) {
      const { data } = supabase.storage
        .from(parsed.bucket)
        .getPublicUrl(parsed.objectPath);
      setResolvedSrc(data.publicUrl);
    } else {
      setResolvedSrc(raw);
    }
  }, [avatarUrl]);

  const handleImageError = async () => {
    if (triedSignedFallback || !avatarUrl) {
      setImgError(true);
      return;
    }
    setTriedSignedFallback(true);

    const parsed = extractStorageBucketAndPath(avatarUrl);
    if (!parsed) {
      setImgError(true);
      return;
    }

    try {
      // 1. Try creating a signed URL using the authenticated session
      const { data: signedData } = await supabase.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.objectPath, 60 * 60 * 24);

      if (signedData?.signedUrl) {
        setResolvedSrc(signedData.signedUrl);
        return;
      }

      // 2. Fallback: download blob via authenticated storage API
      const { data: blobData } = await supabase.storage
        .from(parsed.bucket)
        .download(parsed.objectPath);

      if (blobData) {
        const objectUrl = URL.createObjectURL(blobData);
        setResolvedSrc(objectUrl);
        return;
      }
    } catch {
      // Fall through to initials avatar
    }

    setImgError(true);
  };

  const initials = (name || 'OSA')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const colorIndex =
    (name || 'OSA').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % PALETTE.length;

  const shouldRenderImage = Boolean(resolvedSrc && !imgError && !hidePhotoForPrivacy);

  return (
    <div className={`relative inline-flex shrink-0 select-none ${className}`}>
      {shouldRenderImage ? (
        <img
          src={resolvedSrc!}
          alt={name || 'OSA User'}
          referrerPolicy="no-referrer"
          onError={handleImageError}
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
