import React, { useState } from 'react';
import {
  Gamepad2,
  X,
  Dices,
  Trophy,
  RotateCcw,
  Sparkles,
  Send,
  Users,
  Swords,
  ChevronRight,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface MiniLudoCarromModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
  chatTitle?: string;
  currentUserName: string;
  onShareScore?: (gameText: string) => Promise<void>;
}

export const MiniLudoCarromModal: React.FC<MiniLudoCarromModalProps> = ({
  isOpen,
  onClose,
  language = 'en',
  chatTitle = 'Chat',
  currentUserName,
  onShareScore,
}) => {
  const isBn = language === 'bn';

  const [activeGame, setActiveGame] = useState<'ludo' | 'carrom'>('ludo');

  // Ludo state
  const [diceValue, setDiceValue] = useState<number>(6);
  const [isRolling, setIsRolling] = useState(false);
  const [currentTurn, setCurrentTurn] = useState<'player1' | 'player2'>('player1');
  const [scores, setScores] = useState({ player1: 0, player2: 0 });
  const [lastEvent, setLastEvent] = useState(isBn ? 'ডাইস রোল করে খেলা শুরু করুন!' : 'Roll the dice to start!');

  // Carrom state
  const [carromScore, setCarromScore] = useState({ white: 0, black: 0, queen: false });
  const [strikerPower, setStrikerPower] = useState(65);
  const [carromTurn, setCarromTurn] = useState<'white' | 'black'>('white');

  if (!isOpen) return null;

  const rollDice = () => {
    if (isRolling) return;
    setIsRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count > 8) {
        clearInterval(interval);
        const finalVal = Math.floor(Math.random() * 6) + 1;
        setDiceValue(finalVal);
        setIsRolling(false);

        // Update score & turn
        setScores((prev) => {
          const nextP1 = currentTurn === 'player1' ? prev.player1 + finalVal : prev.player1;
          const nextP2 = currentTurn === 'player2' ? prev.player2 + finalVal : prev.player2;

          if (finalVal === 6) {
            confetti({ particleCount: 30, spread: 50 });
            setLastEvent(
              currentTurn === 'player1'
                ? (isBn ? 'ছক্কা! আপনি আবার চাল পাবেন!' : 'Six! You get another roll!')
                : (isBn ? 'প্রতিদ্বন্দ্বীর ছক্কা! অতিরিক্ত চাল!' : 'Opponent rolled 6! Extra turn!')
            );
          } else {
            setCurrentTurn((prevTurn) => (prevTurn === 'player1' ? 'player2' : 'player1'));
            setLastEvent(
              isBn
                ? `${finalVal} পড়েছে! চাল পরিবর্তন হয়েছে।`
                : `Rolled ${finalVal}! Turn switched.`
            );
          }

          if (nextP1 >= 50 || nextP2 >= 50) {
            confetti({ particleCount: 80, spread: 80 });
            setLastEvent(
              nextP1 >= 50
                ? (isBn ? 'অভিনন্দন! আপনি ৫০ পয়েন্টে বিজয়ী!' : 'Victory! You scored 50+!')
                : (isBn ? 'প্রতিদ্বন্দ্বী বিজয়ী হয়েছে!' : 'Opponent won with 50+!')
            );
          }

          return { player1: nextP1, player2: nextP2 };
        });
      }
    }, 60);
  };

  const handlePocketCoin = (type: 'white' | 'black' | 'queen') => {
    setCarromScore((prev) => {
      let next = { ...prev };
      if (type === 'white') next.white += 10;
      if (type === 'black') next.black += 10;
      if (type === 'queen') {
        next.queen = true;
        next[carromTurn] += 30;
        confetti({ particleCount: 40, spread: 60 });
      }
      return next;
    });
    setCarromTurn((prev) => (prev === 'white' ? 'black' : 'white'));
  };

  const resetGame = () => {
    setScores({ player1: 0, player2: 0 });
    setCarromScore({ white: 0, black: 0, queen: false });
    setCurrentTurn('player1');
    setLastEvent(isBn ? 'নতুন ম্যাচ শুরু হয়েছে!' : 'New match started!');
  };

  const shareGameResult = async () => {
    if (!onShareScore) return;
    const text = activeGame === 'ludo'
      ? `🎲 [OSA Mini Ludo Duel Result]\n` +
        `👤 ${currentUserName}: ${scores.player1} pts\n` +
        `👥 Opponent: ${scores.player2} pts\n` +
        `🏆 Leader: ${scores.player1 > scores.player2 ? currentUserName : scores.player2 > scores.player1 ? 'Opponent' : 'Draw'}\n` +
        `✨ Played inside OSA In-Chat Mini Games`
      : `🎯 [OSA Carrom Board Result]\n` +
        `⚪ White (P1): ${carromScore.white} pts\n` +
        `⚫ Black (P2): ${carromScore.black} pts\n` +
        `👑 Queen Pocketed: ${carromScore.queen ? 'Yes' : 'No'}\n` +
        `✨ Played inside OSA In-Chat Mini Games`;

    try {
      await onShareScore(text);
      confetti({ particleCount: 50, spread: 60 });
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-500 via-orange-600 to-red-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isBn ? 'ইন-চ্যাট মিনি লুডু ও ক্যারাম ডুয়েল' : 'In-Chat Ludo & Carrom Duel'}
              </h3>
              <p className="text-xs text-white/80">
                {isBn ? 'চ্যাটে সরাসরি বন্ধুদের সাথে লাইভ বোর্ড গেম' : 'Play quick casual duels directly in conversation'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveGame('ludo')}
            className={`flex-1 py-2 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeGame === 'ludo'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Dices className="w-4 h-4" />
            {isBn ? 'লুডু ডুয়েল (Ludo)' : 'Mini Ludo'}
          </button>
          <button
            type="button"
            onClick={() => setActiveGame('carrom')}
            className={`flex-1 py-2 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeGame === 'carrom'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Swords className="w-4 h-4" />
            {isBn ? 'ক্যারাম বোর্ড (Carrom)' : 'Mini Carrom'}
          </button>
        </div>

        {/* Game Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {activeGame === 'ludo' ? (
            /* LUDO VIEW */
            <div className="space-y-4">
              {/* Scoreboard */}
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={`p-3 rounded-2xl border transition-all text-center ${
                    currentTurn === 'player1'
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 ring-2 ring-amber-400/30'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 opacity-80'
                  }`}
                >
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300 truncate">
                    {currentUserName} (P1)
                  </p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">
                    {scores.player1} <span className="text-xs font-semibold text-slate-400">pts</span>
                  </p>
                  {currentTurn === 'player1' && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                      {isBn ? 'আপনার চাল' : 'Your Turn'}
                    </span>
                  )}
                </div>

                <div
                  className={`p-3 rounded-2xl border transition-all text-center ${
                    currentTurn === 'player2'
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-400 ring-2 ring-indigo-400/30'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 opacity-80'
                  }`}
                >
                  <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 truncate">
                    {isBn ? 'প্রতিদ্বন্দ্বী বন্ধু' : 'Opponent (P2)'}
                  </p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">
                    {scores.player2} <span className="text-xs font-semibold text-slate-400">pts</span>
                  </p>
                  {currentTurn === 'player2' && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold">
                      {isBn ? 'বন্ধুর চাল' : 'Their Turn'}
                    </span>
                  )}
                </div>
              </div>

              {/* Interactive Dice Arena */}
              <div className="p-6 rounded-3xl bg-gradient-to-b from-amber-50 to-orange-50 dark:from-slate-800 dark:to-slate-850 border border-amber-200 dark:border-slate-700 flex flex-col items-center justify-center space-y-4">
                <div
                  onClick={rollDice}
                  className={`w-24 h-24 rounded-3xl bg-white dark:bg-slate-900 border-4 border-amber-500 shadow-xl flex items-center justify-center text-4xl font-extrabold text-amber-600 dark:text-amber-400 cursor-pointer select-none transition-transform active:scale-90 ${
                    isRolling ? 'animate-spin' : 'hover:scale-105'
                  }`}
                >
                  {diceValue}
                </div>

                <button
                  type="button"
                  onClick={rollDice}
                  disabled={isRolling}
                  className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-extrabold text-sm shadow-lg shadow-amber-600/30 flex items-center gap-2 active:scale-95 transition-all"
                >
                  <Dices className="w-5 h-5" />
                  {isRolling ? (isBn ? 'ডাইস ঘুরছে...' : 'Rolling...') : isBn ? 'ডাইস রোল করুন' : 'Roll Dice'}
                </button>

                <p className="text-xs font-bold text-slate-600 dark:text-slate-300 text-center">
                  {lastEvent}
                </p>
              </div>
            </div>
          ) : (
            /* CARROM VIEW */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                    ⚪ {isBn ? 'সাদা গুটি (White)' : 'White Coins'}
                  </span>
                  <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">
                    {carromScore.white} pts
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                    ⚫ {isBn ? 'কালো গুটি (Black)' : 'Black Coins'}
                  </span>
                  <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">
                    {carromScore.black} pts
                  </p>
                </div>
              </div>

              {/* Carrom Board Simulation Area */}
              <div className="p-6 rounded-3xl bg-amber-950/20 border-2 border-amber-800/40 relative flex flex-col items-center justify-center space-y-4">
                <div className="w-40 h-40 rounded-2xl bg-amber-100 dark:bg-amber-950/40 border-4 border-amber-900/60 relative flex items-center justify-center shadow-inner">
                  {/* Pockets */}
                  <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-slate-950" />
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-950" />
                  <div className="absolute bottom-1 left-1 w-5 h-5 rounded-full bg-slate-950" />
                  <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-slate-950" />
                  {/* Center Queen */}
                  <div className="w-8 h-8 rounded-full bg-rose-600 border-2 border-amber-300 flex items-center justify-center text-xs font-bold text-white shadow-md">
                    👑
                  </div>
                </div>

                {/* Pocket actions */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePocketCoin('white')}
                    className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200"
                  >
                    +10 ⚪ White
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePocketCoin('black')}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-white"
                  >
                    +10 ⚫ Black
                  </button>
                  <button
                    type="button"
                    disabled={carromScore.queen}
                    onClick={() => handlePocketCoin('queen')}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold"
                  >
                    +30 👑 Queen
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={resetGame}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {isBn ? 'রিসেট ম্যাচ' : 'Reset Match'}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              {isBn ? 'বন্ধ' : 'Close'}
            </button>
            {onShareScore && (
              <button
                type="button"
                onClick={shareGameResult}
                className="px-4 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-xl shadow-md shadow-orange-600/30 flex items-center gap-1.5 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                {isBn ? 'স্কোর চ্যাটে পাঠান' : 'Share Score'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
