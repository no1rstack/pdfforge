import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { Operation, OpType, AiNote } from '../types/pdf';
import { Signature, CheckCircle2, Sparkles } from 'lucide-react';

interface PdfViewerProps {
  doc: pdfjs.PDFDocumentProxy;
  currentPage: number;
  zoom: number;
  pan: { x: number; y: number };
  ops: Operation[];
  onAddOp: (op: Omit<Operation, 'id' | 'timestamp'>) => void;
  onUpdateOp: (id: string, updates: Partial<Operation>) => void;
  activeTool: OpType | 'select';
  selectedOpId: string | null;
  onSelectOp: (id: string | null) => void;
  onPageChange: (page: number) => void;
  onTextSelect?: (text: string) => void;
  notes?: AiNote[];
}

export function PdfViewer({
  doc,
  currentPage,
  zoom,
  pan,
  ops,
  onAddOp,
  onUpdateOp,
  activeTool,
  selectedOpId,
  onSelectOp,
  onPageChange,
  onTextSelect,
  notes = []
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number; height: number }>>({});
  const [visiblePages, setVisiblePages] = useState<number[]>([currentPage]);

  // Load page dimensions
  useEffect(() => {
    const loadDimensions = async () => {
      const dims: Record<number, { width: number; height: number }> = {};
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });
        dims[i] = { width: viewport.width, height: viewport.height };
      }
      setPageDimensions(dims);
    };
    loadDimensions();
  }, [doc]);

  // Virtualization: Detect visible pages
  const handleScroll = useCallback(() => {
    if (!containerRef.current || Object.keys(pageDimensions).length === 0) return;

    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    
    const visible: number[] = [];
    let currentY = 0;
    const buffer = 500; // Render buffer

    for (let i = 1; i <= doc.numPages; i++) {
      const height = (pageDimensions[i]?.height || 842) * zoom + 32; // 32 is margin
      const pageTop = currentY;
      const pageBottom = currentY + height;

      if (pageBottom >= scrollTop - buffer && pageTop <= scrollTop + containerHeight + buffer) {
        visible.push(i);
      }

      // Update current page based on center of viewport
      const viewportCenter = scrollTop + containerHeight / 2;
      if (viewportCenter >= pageTop && viewportCenter <= pageBottom) {
        if (currentPage !== i) {
          onPageChange(i);
        }
      }

      currentY += height;
    }

    setVisiblePages(visible);
  }, [doc.numPages, pageDimensions, zoom, currentPage, onPageChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      // Initial check
      handleScroll();
    }
    return () => container?.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Scroll to page when currentPage changes externally
  useEffect(() => {
    if (!containerRef.current || Object.keys(pageDimensions).length === 0) return;
    
    const container = containerRef.current;
    let targetY = 0;
    for (let i = 1; i < currentPage; i++) {
      targetY += (pageDimensions[i]?.height || 842) * zoom + 32;
    }

    // Only scroll if not already near target (prevents scroll loops)
    if (Math.abs(container.scrollTop - targetY) > 50) {
      container.scrollTo({ top: targetY, behavior: 'smooth' });
    }
  }, [currentPage, pageDimensions, zoom]);

  return (
    <div 
      ref={containerRef}
      className="flex-1 w-full bg-[#F5F5F7] overflow-auto flex flex-col items-center p-8 relative scroll-smooth"
    >
      <div className="flex flex-col items-center gap-8 w-full max-w-full">
        {Array.from({ length: doc.numPages }).map((_, i) => {
          const pageNum = i + 1;
          const isVisible = visiblePages.includes(pageNum);
          const dims = pageDimensions[pageNum] || { width: 595, height: 842 };

          return (
            <div 
              key={pageNum}
              style={{ 
                width: dims.width * zoom, 
                height: dims.height * zoom,
                minHeight: dims.height * zoom 
              }}
              className="relative shadow-2xl bg-white rounded-sm overflow-hidden origin-center transition-transform duration-200"
            >
              {isVisible ? (
                <PdfPageRenderer 
                  doc={doc}
                  pageNumber={pageNum}
                  zoom={zoom}
                  ops={ops.filter(op => op.page === pageNum)}
                  onAddOp={onAddOp}
                  onUpdateOp={onUpdateOp}
                  activeTool={activeTool}
                  selectedOpId={selectedOpId}
                  onSelectOp={onSelectOp}
                  onTextSelect={onTextSelect}
                  notes={notes.filter(n => n.page === pageNum)}
                  width={dims.width * zoom}
                  height={dims.height * zoom}
                  originalWidth={dims.width}
                  originalHeight={dims.height}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white">
                  <span className="text-xs font-medium text-black/10">Page {pageNum}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Internal component for rendering a single page with its own canvas and render task
function PdfPageRenderer({ 
  doc, 
  pageNumber, 
  zoom, 
  ops, 
  onAddOp, 
  onUpdateOp,
  activeTool, 
  selectedOpId, 
  onSelectOp,
  onTextSelect,
  notes,
  width,
  height,
  originalWidth,
  originalHeight
}: { 
  doc: pdfjs.PDFDocumentProxy, 
  pageNumber: number, 
  zoom: number,
  ops: Operation[],
  onAddOp: (op: Omit<Operation, 'id' | 'timestamp'>) => void,
  onUpdateOp: (id: string, updates: Partial<Operation>) => void,
  activeTool: OpType | 'select',
  selectedOpId: string | null,
  onSelectOp: (id: string | null) => void,
  onTextSelect?: (text: string) => void,
  notes?: AiNote[],
  width: number,
  height: number,
  originalWidth: number,
  originalHeight: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [isRendered, setIsRendered] = useState(false);
  const activeRenderTaskRef = useRef<any>(null);
  const renderLockRef = useRef<Promise<void>>(Promise.resolve());
  
  const [dragState, setDragState] = useState<{
    id: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  const [resizeState, setResizeState] = useState<{
    id: string;
    startX: number;
    startY: number;
    initialW: number;
    initialH: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  const [drawingState, setDrawingState] = useState<{
    type: 'draw' | 'highlight';
    points?: Array<{ x: number; y: number }>;
    startX?: number;
    startY?: number;
    currentX?: number;
    currentY?: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const renderPage = async () => {
      // Chain the render operation to ensure sequential execution on the same canvas
      renderLockRef.current = renderLockRef.current.then(async () => {
        // 1. Cancel existing task
        if (activeRenderTaskRef.current) {
          activeRenderTaskRef.current.cancel();
          try {
            await activeRenderTaskRef.current.promise;
          } catch (e) {
            // Expected cancellation
          }
        }

        // 2. Start new task
        try {
          const page = await doc.getPage(pageNumber);
          const renderScale = Math.max(2, zoom * 1.5); 
          const viewport = page.getViewport({ scale: renderScale });
          
          const canvas = canvasRef.current;
          if (!canvas) return;

          const context = canvas.getContext('2d');
          if (!context) return;

          // Setting dimensions clears the canvas
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext: any = {
            canvasContext: context,
            viewport: viewport,
          };

          const renderTask = page.render(renderContext);
          activeRenderTaskRef.current = renderTask;
          
          await renderTask.promise;

          // Render text layer
          if (textLayerRef.current) {
            textLayerRef.current.innerHTML = '';
            const textContent = await page.getTextContent();
            const textLayer = new pdfjs.TextLayer({
              textContentSource: textContent,
              container: textLayerRef.current,
              viewport: viewport,
            });
            await textLayer.render();
          }

          setIsRendered(true);
        } catch (error: any) {
          if (error.name !== 'RenderingCancelledException') {
            console.error(`PDF render error (Page ${pageNumber}):`, error);
          }
        } finally {
          activeRenderTaskRef.current = null;
        }
      });
    };

    renderPage();

    return () => {
      if (activeRenderTaskRef.current) {
        activeRenderTaskRef.current.cancel();
      }
    };
  }, [doc, pageNumber, zoom]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    // If we were dragging or drawing, don't place a new element
    if (dragState || drawingState) return;
    
    if (activeTool === 'select') {
      onSelectOp(null);
      return;
    }

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Calculate relative coordinates based on the zoom
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    if (activeTool === 'add_text') {
      onAddOp({
        type: 'add_text',
        page: pageNumber,
        x,
        y,
        text: 'New Text',
        font: 'Inter',
        size: 14,
        color: '#000000'
      } as any);
    } else if (activeTool === 'signature') {
      onAddOp({
        type: 'signature',
        page: pageNumber,
        x: x - 50,
        y: y - 25,
        w: 100,
        h: 50,
        assetId: 'sig_default'
      } as any);
    } else if (activeTool === 'place_image') {
      fileInputRef.current?.click();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    // We'll use a placeholder or data URL for the image
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      onAddOp({
        type: 'place_image',
        page: pageNumber,
        x: 50, // Default position
        y: 50,
        w: 200,
        h: 150,
        assetId: dataUrl // Store data URL as assetId for now
      } as any);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset
  };

  const handleMouseDown = (e: React.MouseEvent, op?: Operation) => {
    if (op) {
      // Dragging existing element
      e.stopPropagation();
      onSelectOp(op.id);
      
      if (activeTool === 'select') {
        const isResizeHandle = (e.target as HTMLElement).closest('.resize-handle');
        
        if (isResizeHandle && 'w' in op && 'h' in op && 'x' in op && 'y' in op) {
          setResizeState({
            id: op.id,
            startX: e.clientX,
            startY: e.clientY,
            initialW: op.w,
            initialH: op.h,
            initialX: op.x,
            initialY: op.y
          });
          return;
        }

        if ('x' in op && 'y' in op) {
          setDragState({
            id: op.id,
            startX: e.clientX,
            startY: e.clientY,
            initialX: op.x,
            initialY: op.y
          });
        }
      }
      return;
    }

    // Starting a new drawing/highlight
    if (activeTool === 'draw' || activeTool === 'highlight') {
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;

      if (activeTool === 'draw') {
        setDrawingState({
          type: 'draw',
          points: [{ x, y }]
        });
      } else {
        setDrawingState({
          type: 'highlight',
          startX: x,
          startY: y,
          currentX: x,
          currentY: y
        });
      }
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragState) {
      const dx = (e.clientX - dragState.startX) / zoom;
      const dy = (e.clientY - dragState.startY) / zoom;

      onUpdateOp(dragState.id, {
        x: dragState.initialX + dx,
        y: dragState.initialY + dy
      } as any);
    } else if (resizeState) {
      const dx = (e.clientX - resizeState.startX) / zoom;
      const dy = (e.clientY - resizeState.startY) / zoom;

      onUpdateOp(resizeState.id, {
        w: Math.max(20, resizeState.initialW + dx),
        h: Math.max(20, resizeState.initialH + dy)
      } as any);
    } else if (drawingState) {
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;

      if (drawingState.type === 'draw') {
        setDrawingState(prev => ({
          ...prev!,
          points: [...(prev!.points || []), { x, y }]
        }));
      } else {
        setDrawingState(prev => ({
          ...prev!,
          currentX: x,
          currentY: y
        }));
      }
    }
  }, [dragState, drawingState, zoom, onUpdateOp]);

  const handleMouseUp = useCallback(() => {
    if (drawingState) {
      if (drawingState.type === 'draw' && drawingState.points && drawingState.points.length > 1) {
        onAddOp({
          type: 'draw',
          page: pageNumber,
          points: drawingState.points,
          color: '#000000',
          width: 2
        } as any);
      } else if (drawingState.type === 'highlight' && drawingState.startX !== undefined) {
        const x = Math.min(drawingState.startX, drawingState.currentX!);
        const y = Math.min(drawingState.startY!, drawingState.currentY!);
        const w = Math.abs(drawingState.startX - drawingState.currentX!);
        const h = Math.abs(drawingState.startY! - drawingState.currentY!);
        
        if (w > 5 && h > 5) {
          onAddOp({
            type: 'highlight',
            page: pageNumber,
            rects: [[x, y, w, h]],
            x, y, w, h,
            color: '#FFEB3B'
          } as any);
        }
      }
      setDrawingState(null);
    }

    // Capture text selection
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    if (selectedText && selectedText.length > 0) {
      onTextSelect?.(selectedText);
    } else if (!dragState && !resizeState && !drawingState) {
      // Only clear if we didn't just perform an action
      onTextSelect?.('');
    }

    setDragState(null);
    setResizeState(null);
  }, [drawingState, pageNumber, onAddOp, onTextSelect, dragState, resizeState]);

  useEffect(() => {
    if (dragState || drawingState || resizeState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, drawingState, resizeState, handleMouseMove, handleMouseUp]);

  return (
    <div 
      ref={overlayRef}
      className={cn(
        "relative w-full h-full",
        activeTool === 'select' ? "cursor-default" : "cursor-crosshair"
      )}
      onClick={handleOverlayClick}
      onMouseDown={(e) => handleMouseDown(e)}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleImageUpload} 
      />
      <canvas 
        ref={canvasRef} 
        className={cn(
          "block w-full h-full transition-opacity duration-300",
          isRendered ? "opacity-100" : "opacity-0"
        )} 
      />
      
      {/* Text Layer for selection */}
      <div 
        ref={textLayerRef}
        className="absolute top-0 left-0 textLayer pointer-events-auto"
        style={{ 
          width: width, 
          height: height,
          opacity: 0.2 // Make it slightly visible for debugging if needed, but usually 0 or hidden
        }}
      />
      
      {/* Operation Overlay Layer */}
      <div 
        className="absolute top-0 left-0 pointer-events-none" 
        style={{ 
          width: originalWidth, 
          height: originalHeight, 
          transform: `scale(${zoom})`, 
          transformOrigin: 'top left' 
        }}
      >
        {/* Render active drawing/highlight */}
        {drawingState && drawingState.type === 'draw' && drawingState.points && (
          <svg className="absolute inset-0 w-full h-full overflow-visible">
            <polyline
              points={drawingState.points.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#000000"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {drawingState && drawingState.type === 'highlight' && drawingState.startX !== undefined && (
          <div 
            className="absolute bg-yellow-400/30 border border-yellow-400/50"
            style={{
              left: Math.min(drawingState.startX, drawingState.currentX!),
              top: Math.min(drawingState.startY!, drawingState.currentY!),
              width: Math.abs(drawingState.startX - drawingState.currentX!),
              height: Math.abs(drawingState.startY! - drawingState.currentY!)
            }}
          />
        )}

        {/* Render AI Notes */}
        {notes?.map(note => (
          <div 
            key={note.id}
            className="absolute p-2 bg-amber-50 border border-amber-200 rounded-lg shadow-lg max-w-[150px] z-20 pointer-events-auto cursor-help group"
            style={{ left: note.x, top: note.y }}
          >
            <Sparkles className="w-3 h-3 text-amber-500 mb-1" />
            <p className="text-[8px] leading-tight text-black/60 line-clamp-3 group-hover:line-clamp-none transition-all">
              {note.text}
            </p>
          </div>
        ))}

        {ops.map(op => (
          <div 
            key={op.id} 
            className="absolute pointer-events-auto"
            style={{ 
              left: ('x' in op ? op.x : 0), 
              top: ('y' in op ? op.y : 0),
              zIndex: selectedOpId === op.id ? 10 : 1
            }}
            onMouseDown={(e) => handleMouseDown(e, op)}
            onClick={(e) => e.stopPropagation()}
          >
            {op.type === 'add_text' && 'x' in op && (
              <div 
                style={{ 
                  color: op.color, 
                  fontSize: op.size, 
                  fontFamily: op.fontFamily || op.font,
                  fontWeight: op.fontWeight || 'normal',
                  fontStyle: op.fontStyle || 'normal'
                }}
                className={cn(
                  "whitespace-nowrap border-2 transition-all px-2 py-1 rounded cursor-move select-none",
                  selectedOpId === op.id ? "border-blue-500 bg-blue-500/10 shadow-lg ring-4 ring-blue-500/20" : "border-transparent hover:border-blue-500/50 hover:bg-blue-500/5"
                )}
              >
                {op.text}
              </div>
            )}
            {op.type === 'signature' && 'x' in op && (
              <div 
                style={{ width: op.w, height: op.h }}
                className={cn(
                  "border-2 border-dashed rounded flex flex-col items-center justify-center group cursor-move transition-all select-none overflow-hidden",
                  selectedOpId === op.id ? "border-blue-500 bg-blue-500/10 shadow-lg ring-4 ring-blue-500/20" : "border-blue-500/30 bg-blue-500/5 hover:border-blue-500/50"
                )}
              >
                {op.assetId === 'sig_default' ? (
                  <>
                    <Signature className={cn(
                      "w-6 h-6 mb-1",
                      selectedOpId === op.id ? "text-blue-500" : "text-blue-500/40"
                    )} />
                    <span className="text-[8px] font-bold uppercase tracking-tighter opacity-40">Signature Placeholder</span>
                  </>
                ) : (
                  <img src={op.assetId} alt="Signature" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                )}
                {selectedOpId === op.id && (
                   <>
                     <div className="absolute -top-2 -right-2">
                       <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-sm">
                         <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                       </div>
                     </div>
                     <div className="resize-handle absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-nwse-resize shadow-sm" />
                   </>
                )}
              </div>
            )}
            {op.type === 'highlight' && (
              <div 
                className={cn(
                  "absolute border-2 transition-all cursor-move",
                  selectedOpId === op.id ? "border-blue-500 bg-blue-500/10 shadow-lg ring-4 ring-blue-500/20" : "border-transparent"
                )}
                style={{
                  left: op.x || op.rects[0][0],
                  top: op.y || op.rects[0][1],
                  width: op.w || op.rects[0][2],
                  height: op.h || op.rects[0][3],
                  backgroundColor: op.color + '4D' // 30% opacity
                }}
              >
                {selectedOpId === op.id && (
                  <div className="resize-handle absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-nwse-resize shadow-sm" />
                )}
              </div>
            )}
            {op.type === 'draw' && (
              <div className={cn(
                "cursor-move",
                selectedOpId === op.id ? "ring-4 ring-blue-500/20 rounded-lg p-1 bg-blue-500/5" : ""
              )}>
                <svg 
                  width={Math.max(...op.points.map(p => p.x)) - Math.min(...op.points.map(p => p.x)) + 10}
                  height={Math.max(...op.points.map(p => p.y)) - Math.min(...op.points.map(p => p.y)) + 10}
                  className="overflow-visible"
                >
                  <polyline
                    points={op.points.map(p => `${p.x - Math.min(...op.points.map(p => p.x))},${p.y - Math.min(...op.points.map(p => p.y))}`).join(' ')}
                    fill="none"
                    stroke={op.color}
                    strokeWidth={op.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
            {op.type === 'place_image' && 'x' in op && (
              <div 
                style={{ width: op.w, height: op.h }}
                className={cn(
                  "border-2 transition-all cursor-move select-none overflow-hidden rounded-lg",
                  selectedOpId === op.id ? "border-blue-500 bg-blue-500/10 shadow-lg ring-4 ring-blue-500/20" : "border-transparent hover:border-blue-500/50"
                )}
              >
                <img 
                  src={op.assetId} 
                  alt="Placed" 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
                {selectedOpId === op.id && (
                  <div className="resize-handle absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-nwse-resize shadow-sm" />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
