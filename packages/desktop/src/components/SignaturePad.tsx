import { useRef, useState, useCallback } from 'react';

export default function SignaturePad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const isDrawing  = useRef(false);
  const lastPos    = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode]         = useState<'draw' | 'upload'>('draw');
  const [hasStrokes, setHasStrokes] = useState(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const r = canvas.getBoundingClientRect();
    if ('touches' in e) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    return { x: (e as React.MouseEvent).clientX - r.left, y: (e as React.MouseEvent).clientY - r.top };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    isDrawing.current = true;
    lastPos.current = getPos(e, canvas);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
  }, []);

  const stopDraw = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const canvas = canvasRef.current; if (!canvas) return;
    setHasStrokes(true);
    onChange(canvas.toDataURL('image/png'));
  }, [onChange]);

  const clear = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false); onChange('');
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const isImage = value?.startsWith('data:image');

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button"
          onClick={() => setMode('draw')}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
            mode === 'draw' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}>✏️ Draw</button>
        <button type="button"
          onClick={() => setMode('upload')}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
            mode === 'upload' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}>📁 Upload image</button>
        {(isImage || hasStrokes) && (
          <button type="button" onClick={clear}
            className="ml-auto text-xs px-3 py-1.5 rounded-md bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-200 font-medium">
            ✕ Clear
          </button>
        )}
      </div>

      {mode === 'draw' && (
        <div>
          <canvas ref={canvasRef} width={400} height={110}
            className="w-full rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white touch-none"
            style={{ cursor: 'crosshair', display: 'block' }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
          {!hasStrokes && (
            <p className="text-xs text-slate-400 mt-1 text-center">Draw your signature using mouse, touchpad, or touchscreen</p>
          )}
          {isImage && hasStrokes && (
            <p className="text-xs text-emerald-500 mt-1 text-center">✓ Signature captured</p>
          )}
        </div>
      )}

      {mode === 'upload' && (
        <div className="space-y-2">
          <input type="file" accept="image/*" onChange={handleUpload}
            className="block w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          {isImage
            ? <div className="border rounded-lg p-2 bg-white dark:bg-slate-800 inline-block">
                <img src={value} alt="signature" className="max-h-16 max-w-full" />
              </div>
            : <p className="text-xs text-slate-400">Upload a photo/scan of your handwritten signature (PNG, JPG)</p>
          }
        </div>
      )}
    </div>
  );
}
