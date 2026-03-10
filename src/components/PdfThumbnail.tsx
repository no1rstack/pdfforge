import React, { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { cn } from '../lib/utils';
import { Plus } from 'lucide-react';

interface PdfThumbnailProps {
  key?: React.Key;
  doc: pdfjs.PDFDocumentProxy;
  pageNumber: number;
  isActive: boolean;
  onClick: () => void;
}

export function PdfThumbnail({ doc, pageNumber, isActive, onClick }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRenderTaskRef = useRef<any>(null);
  const renderLockRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !canvasRef.current) return;

    const renderThumbnail = async () => {
      renderLockRef.current = renderLockRef.current.then(async () => {
        if (activeRenderTaskRef.current) {
          activeRenderTaskRef.current.cancel();
          try {
            await activeRenderTaskRef.current.promise;
          } catch (e) {}
        }

        try {
          const page = await doc.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 0.2 });
          const canvas = canvasRef.current;
          if (!canvas) return;

          const context = canvas.getContext('2d');
          if (!context) return;

          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext: any = {
            canvasContext: context,
            viewport: viewport,
          };
          const renderTask = page.render(renderContext);
          activeRenderTaskRef.current = renderTask;

          await renderTask.promise;
        } catch (error: any) {
          if (error.name !== 'RenderingCancelledException') {
            console.error('Thumbnail render error:', error);
          }
        } finally {
          activeRenderTaskRef.current = null;
        }
      });
    };

    renderThumbnail();

    return () => {
      if (activeRenderTaskRef.current) activeRenderTaskRef.current.cancel();
    };
  }, [doc, pageNumber, isVisible]);

  return (
    <div 
      ref={containerRef}
      onClick={onClick}
      className={cn(
        "aspect-[3/4] bg-black/5 rounded-lg border-2 transition-all cursor-pointer flex items-center justify-center relative group overflow-hidden",
        isActive ? "border-black shadow-md" : "border-transparent hover:border-black/10"
      )}
    >
      {isVisible ? (
        <canvas ref={canvasRef} className="w-full h-full object-contain" />
      ) : (
        <span className="text-xs font-medium text-black/20">{pageNumber}</span>
      )}
      
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
      
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-4 h-4 bg-white rounded shadow-sm flex items-center justify-center">
          <Plus className="w-3 h-3" />
        </div>
      </div>
      
      <div className="absolute bottom-2 left-2 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] font-bold text-black/40">
        {pageNumber}
      </div>
    </div>
  );
}
