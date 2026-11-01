import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Send,
  Download,
  RotateCcw,
  RotateCw,
  Trash2,
  Pen,
  Highlighter,
  Eraser,
  Square,
  Circle as CircleIcon,
  Minus,
  Sparkles,
  Users
} from 'lucide-react';
import { RealtimeChannel } from '@supabase/supabase-js';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  tool: 'pen' | 'marker' | 'eraser' | 'line' | 'rect' | 'circle';
  color: string;
  size: number;
  points: Point[];
}

interface CollaborativeCanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendImage: (imageDataUrl: string, caption?: string) => Promise<void>;
  channel: RealtimeChannel | null;
  chatId: string;
  currentUser: {
    id: string;
    full_name: string;
  };
  language?: string;
}

const PALETTE = [
  '#000000', // Black
  '#FFFFFF', // White
  '#EF4444', // Red
  '#F97316', // Orange
  '#FACC15', // Yellow
  '#10B981', // Green
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#84CC16', // Lime
  '#64748B', // Slate
];

export const CollaborativeCanvasModal: React.FC<CollaborativeCanvasModalProps> = ({
  isOpen,
  onClose,
  onSendImage,
  channel,
  chatId,
  currentUser,
  language = 'en',
}) => {
  const isBn = language === 'bn';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<'pen' | 'marker' | 'eraser' | 'line' | 'rect' | 'circle'>('pen');
  const [color, setColor] = useState<string>('#3B82F6');
  const [size, setSize] = useState<number>(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [peerDrawingActive, setPeerDrawingActive] = useState(false);

  const currentStrokeRef = useRef<Stroke | null>(null);

  // Redraw canvas from stroke list
  const redrawCanvas = useCallback((strokeList: Stroke[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background to white
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const s of strokeList) {
      if (s.points.length === 0) continue;

      ctx.save();
      ctx.lineWidth = s.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (s.tool === 'eraser') {
        ctx.strokeStyle = '#FFFFFF';
      } else if (s.tool === 'marker') {
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.35;
      } else {
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 1.0;
      }

      if (s.tool === 'line') {
        const p1 = s.points[0];
        const p2 = s.points[s.points.length - 1];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      } else if (s.tool === 'rect') {
        const p1 = s.points[0];
        const p2 = s.points[s.points.length - 1];
        ctx.beginPath();
        ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      } else if (s.tool === 'circle') {
        const p1 = s.points[0];
        const p2 = s.points[s.points.length - 1];
        const radius = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else {
        // Continuous line (pen, marker, eraser)
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        ctx.stroke();
      }

      ctx.restore();
    }
  }, []);

  // Sync canvas size on open & resize
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width;
      canvas.height = rect.height;
      redrawCanvas(strokes);
    }
  }, [isOpen, redrawCanvas, strokes]);

  // Real-time Broadcast Listener for Peer strokes
  useEffect(() => {
    if (!channel || !isOpen) return;

    const handlePeerStroke = (payload: { payload: { senderId: string; stroke?: Stroke; action?: 'clear' } }) => {
      const data = payload.payload;
      if (data.senderId === currentUser.id) return;

      if (data.action === 'clear') {
        setStrokes([]);
        setRedoStack([]);
        redrawCanvas([]);
        return;
      }

      if (data.stroke) {
        setPeerDrawingActive(true);
        setTimeout(() => setPeerDrawingActive(false), 800);
        setStrokes((prev) => {
          const updated = [...prev, data.stroke!];
          redrawCanvas(updated);
          return updated;
        });
      }
    };

    channel.on('broadcast', { event: 'canvas_sync' }, handlePeerStroke);

    return () => {
      // channel listener cleanup if needed
    };
  }, [channel, isOpen, currentUser.id, redrawCanvas]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoords(e);
    if (!pt) return;
    setIsDrawing(true);
    setRedoStack([]);

    const newStroke: Stroke = {
      tool,
      color,
      size: tool === 'eraser' ? size * 3 : tool === 'marker' ? size * 2.5 : size,
      points: [pt],
    };
    currentStrokeRef.current = newStroke;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentStrokeRef.current) return;
    const pt = getCanvasCoords(e);
    if (!pt) return;

    currentStrokeRef.current.points.push(pt);

    // Live preview
    const tempStrokes = [...strokes, currentStrokeRef.current];
    redrawCanvas(tempStrokes);
  };

  const stopDrawing = () => {
    if (!isDrawing || !currentStrokeRef.current) return;
    setIsDrawing(false);

    const completedStroke = currentStrokeRef.current;
    currentStrokeRef.current = null;

    setStrokes((prev) => {
      const next = [...prev, completedStroke];
      redrawCanvas(next);
      return next;
    });

    // Broadcast completed stroke to other participants
    channel?.send({
      type: 'broadcast',
      event: 'canvas_sync',
      payload: {
        senderId: currentUser.id,
        stroke: completedStroke,
      },
    });
  };

  const handleUndo = () => {
    if (strokes.length === 0) return;
    const last = strokes[strokes.length - 1];
    const remaining = strokes.slice(0, -1);
    setStrokes(remaining);
    setRedoStack((prev) => [...prev, last]);
    redrawCanvas(remaining);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextStroke = redoStack[redoStack.length - 1];
    const remainingRedo = redoStack.slice(0, -1);
    const updated = [...strokes, nextStroke];
    setStrokes(updated);
    setRedoStack(remainingRedo);
    redrawCanvas(updated);
  };

  const handleClear = () => {
    if (strokes.length === 0) return;
    if (window.confirm(isBn ? 'আপনি কি পুরো ক্যানভাস মুছে ফেলতে চান?' : 'Clear entire whiteboard canvas?')) {
      setStrokes([]);
      setRedoStack([]);
      redrawCanvas([]);

      channel?.send({
        type: 'broadcast',
        event: 'canvas_sync',
        payload: {
          senderId: currentUser.id,
          action: 'clear',
        },
      });
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `whiteboard-sketch-${Date.now()}.png`;
    a.click();
  };

  const handleSendToChat = async () => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    setIsSending(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      await onSendImage(dataUrl, isBn ? '🎨 হোয়াইটবোর্ড ড্রয়িং' : '🎨 Collaborative Whiteboard Sketch');
      onClose();
    } catch {
      // Handled in parent
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-4xl h-[92vh] max-h-[850px] bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Top Header Bar */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/25">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-100">
                  {isBn ? 'লাইভ শেয়ার্ড হোয়াইটবোর্ড' : 'Live Collaborative Whiteboard'}
                </h3>
                {peerDrawingActive && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse flex items-center gap-1 font-mono">
                    <Users className="w-3 h-3" />
                    {isBn ? 'পার্টনার ড্রয়িং করছে...' : 'Peer is drawing...'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {isBn ? 'একসাথে রিয়েল-টাইমে আঁকুন ও চ্যাটে পাঠান' : 'Draw together in real-time & send to chat'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={handleUndo}
              disabled={strokes.length === 0}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 disabled:opacity-30 transition-all"
              title="Undo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 disabled:opacity-30 transition-all"
              title="Redo"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleClear}
              disabled={strokes.length === 0}
              className="p-2 text-slate-400 hover:text-red-400 rounded-xl hover:bg-slate-800 disabled:opacity-30 transition-all"
              title="Clear Canvas"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="p-2 text-slate-400 hover:text-emerald-400 rounded-xl hover:bg-slate-800 transition-all"
              title="Save Image"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-red-400 rounded-xl hover:bg-slate-800 transition-all"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tools & Palette Toolbar */}
        <div className="px-3 sm:px-4 py-2 bg-slate-900 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Tool selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setTool('pen')}
              className={`p-2 rounded-xl transition-all ${tool === 'pen' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              title="Pen"
            >
              <Pen className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setTool('marker')}
              className={`p-2 rounded-xl transition-all ${tool === 'marker' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              title="Highlighter"
            >
              <Highlighter className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setTool('eraser')}
              className={`p-2 rounded-xl transition-all ${tool === 'eraser' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              title="Eraser"
            >
              <Eraser className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-slate-800 mx-0.5" />
            <button
              type="button"
              onClick={() => setTool('line')}
              className={`p-2 rounded-xl transition-all ${tool === 'line' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              title="Straight Line"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setTool('rect')}
              className={`p-2 rounded-xl transition-all ${tool === 'rect' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              title="Rectangle"
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setTool('circle')}
              className={`p-2 rounded-xl transition-all ${tool === 'circle' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              title="Circle"
            >
              <CircleIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Color palette */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`w-6 h-6 rounded-full border-2 transition-all shrink-0 ${color === c ? 'border-white scale-125 shadow-md shadow-white/30' : 'border-slate-700/60 hover:scale-110'}`}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-6 h-6 rounded-full border-none cursor-pointer bg-transparent"
              title="Custom Color"
            />
          </div>

          {/* Stroke size slider */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Size</span>
            <input
              type="range"
              min="2"
              max="28"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-20 accent-blue-500 cursor-pointer"
            />
            <div
              style={{ width: size, height: size, backgroundColor: color }}
              className="rounded-full shrink-0 border border-slate-600"
            />
          </div>
        </div>

        {/* Canvas Workspace Viewport */}
        <div className="flex-1 bg-white relative overflow-hidden select-none touch-none cursor-crosshair">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="w-full h-full block"
          />
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400">
            {strokes.length} {isBn ? 'টি স্ট্রোক আঁকা হয়েছে' : 'strokes drawn'}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
            >
              {isBn ? 'বাতিল' : 'Cancel'}
            </button>

            <button
              type="button"
              onClick={handleSendToChat}
              disabled={strokes.length === 0 || isSending}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-lg shadow-blue-500/25 active:scale-95 disabled:opacity-40 transition-all flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{isSending ? (isBn ? 'পাঠানো হচ্ছে...' : 'Sending...') : (isBn ? 'চ্যাটে পাঠান' : 'Send to Chat')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
