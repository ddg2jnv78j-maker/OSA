import React from 'react';
import { MessageSquare } from 'lucide-react';

interface SplashScreenProps {
  statusText?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ statusText = 'Connecting to OSA...' }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-white px-6 select-none">
      <div className="relative flex items-center justify-center w-24 h-24 rounded-3xl bg-blue-600 shadow-xl shadow-blue-600/30 mb-6">
        <MessageSquare className="w-12 h-12 text-white" />
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-green-500 border-4 border-slate-950" />
      </div>

      <h1 className="font-display text-4xl font-extrabold tracking-wider text-white mb-2">
        OSA
      </h1>
      <p className="text-sm text-slate-400 mb-8 text-center max-w-xs">
        Real-Time Messaging, Status, Groups &amp; WebRTC Calling
      </p>

      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-3 border-blue-500/30 border-t-blue-500 animate-spin" />
        <span className="text-xs text-slate-400 font-medium">{statusText}</span>
      </div>
    </div>
  );
};
