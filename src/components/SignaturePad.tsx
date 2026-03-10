import React, { useRef, useState, useEffect } from 'react';
import { Eraser, PenTool, Type as TypeIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

export function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedText, setTypedText] = useState('');
  const [selectedFont, setSelectedFont] = useState('Dancing Script');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const fonts = [
    'Dancing Script',
    'Great Vibes',
    'Alex Brush',
    'Pacifico',
    'Caveat'
  ];

  useEffect(() => {
    if (mode === 'draw') {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
        }
      }
    }
  }, [mode]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = () => {
    if (mode === 'draw') {
      const canvas = canvasRef.current;
      if (canvas) {
        onSave(canvas.toDataURL());
      }
    } else {
      // Create a canvas to render the text
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        ctx.font = `48px "${selectedFont}"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(typedText, canvas.width / 2, canvas.height / 2);
        onSave(canvas.toDataURL());
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 bg-black/5 p-1 rounded-lg">
        <button 
          onClick={() => setMode('draw')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all",
            mode === 'draw' ? "bg-white shadow-sm" : "text-black/40 hover:text-black"
          )}
        >
          <PenTool className="w-3.5 h-3.5" />
          Draw
        </button>
        <button 
          onClick={() => setMode('type')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all",
            mode === 'type' ? "bg-white shadow-sm" : "text-black/40 hover:text-black"
          )}
        >
          <TypeIcon className="w-3.5 h-3.5" />
          Type
        </button>
      </div>

      {mode === 'draw' ? (
        <div className="relative group">
          <canvas
            ref={canvasRef}
            width={400}
            height={200}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="w-full h-[150px] bg-white border-2 border-black/5 rounded-xl cursor-crosshair"
          />
          <button 
            onClick={clear}
            className="absolute top-2 right-2 p-1.5 bg-white shadow-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Eraser className="w-3.5 h-3.5 text-black/40 hover:text-red-500" />
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input 
            type="text"
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            placeholder="Type your name..."
            className="w-full p-3 bg-black/5 rounded-xl text-lg font-medium focus:outline-none focus:ring-2 focus:ring-black/10"
            style={{ fontFamily: selectedFont }}
          />
          <div className="grid grid-cols-2 gap-2">
            {fonts.map(font => (
              <button
                key={font}
                onClick={() => setSelectedFont(font)}
                className={cn(
                  "p-2 text-sm rounded-lg border transition-all truncate",
                  selectedFont === font ? "border-black bg-black text-white" : "border-black/5 hover:border-black/20"
                )}
                style={{ fontFamily: font }}
              >
                {font}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button 
          onClick={onCancel}
          className="flex-1 py-2 text-xs font-bold text-black/40 hover:text-black transition-colors"
        >
          Cancel
        </button>
        <button 
          onClick={handleSave}
          disabled={mode === 'type' && !typedText}
          className="flex-1 py-2 bg-black text-white text-xs font-bold rounded-lg hover:bg-black/90 transition-colors disabled:opacity-30"
        >
          Apply Signature
        </button>
      </div>
    </div>
  );
}
