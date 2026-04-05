import React, { useState, useEffect, useRef } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, 
  Type, 
  Highlighter, 
  PenTool, 
  Image as ImageIcon, 
  Signature, 
  Download, 
  Upload, 
  Layers, 
  ChevronLeft, 
  ChevronRight,
  Search,
  Undo2,
  Redo2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  X,
  Minus,
  Plus,
  Sparkles
} from 'lucide-react';
import { cn } from './lib/utils';
import { Operation, Job, OpType, AiSession, AiNote, AiMode } from './types/pdf';
import { apiService } from './services/apiService';
import { PdfViewer } from './components/PdfViewer';
import { PdfThumbnail } from './components/PdfThumbnail';
import { SignaturePad } from './components/SignaturePad';
import { AiAssistantPanel } from './components/AiAssistantPanel';
import { GeminiContext } from './services/gemini';
import { PDFDocument } from 'pdf-lib';

// Initialize PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [activeTool, setActiveTool] = useState<OpType | 'select'>('select');
  const [ops, setOps] = useState<Operation[]>([]);
  const [history, setHistory] = useState<Operation[][]>([]);
  const [redoStack, setRedoStack] = useState<Operation[][]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isJobsOpen, setIsJobsOpen] = useState(false);
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  
  // AI State
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiSession, setAiSession] = useState<AiSession>({
    messages: [],
    isExternalResearchEnabled: false,
    mode: 'analyze',
    notes: []
  });
  const [selectedText, setSelectedText] = useState('');
  const [fullText, setFullText] = useState('');
  const [currentPageText, setCurrentPageText] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll for jobs
  useEffect(() => {
    const interval = setInterval(() => {
      setJobs(apiService.getJobs());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const loadingTask = pdfjs.getDocument(arrayBuffer);
      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setCurrentPage(1);
      
      // Extract full text for AI context
      let text = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
      }
      setFullText(text);
      
      // Simulate backend ingest
      await apiService.uploadDocument(uploadedFile);
    }
  };

  // Update current page text for AI context
  useEffect(() => {
    const extractPageText = async () => {
      if (!pdfDoc) return;
      try {
        const page = await pdfDoc.getPage(currentPage);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(' ');
        setCurrentPageText(text);
      } catch (error) {
        console.error('Error extracting page text:', error);
      }
    };
    extractPageText();
  }, [pdfDoc, currentPage]);

  const pushToHistory = (newOps: Operation[]) => {
    setHistory(prev => [...prev, ops]);
    setRedoStack([]);
    setOps(newOps);
  };

  const undo = () => {
    if (history.length === 0) return;
    const prevOps = history[history.length - 1];
    setRedoStack(prev => [...prev, ops]);
    setHistory(prev => prev.slice(0, -1));
    setOps(prevOps);
    setSelectedOpId(null);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const nextOps = redoStack[redoStack.length - 1];
    setHistory(prev => [...prev, ops]);
    setRedoStack(prev => prev.slice(0, -1));
    setOps(nextOps);
    setSelectedOpId(null);
  };

  const addOperation = (op: Omit<Operation, 'id' | 'timestamp'>) => {
    const newOp = {
      ...op,
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now()
    } as Operation;
    pushToHistory([...ops, newOp]);
    setSelectedOpId(newOp.id);
  };

  const updateOp = (id: string, updates: Partial<Operation>) => {
    pushToHistory(ops.map(o => o.id === id ? { ...o, ...updates } as Operation : o));
  };

  const handleExport = async () => {
    if (!file) return;
    await apiService.compileDocument('doc_current', ops);
    setIsJobsOpen(true);
  };

  const handleSplit = async () => {
    if (!file || selectedPages.length === 0) return;
    
    setIsSplitting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const newPdf = await PDFDocument.create();
      
      // pdf-lib uses 0-indexed pages
      const copiedPages = await newPdf.copyPages(pdfDoc, selectedPages.map(p => p - 1));
      copiedPages.forEach(page => newPdf.addPage(page));
      
      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `split_${file.name}`;
      a.click();
      URL.revokeObjectURL(url);
      
      setSelectedPages([]);
    } catch (error) {
      console.error('Split error:', error);
    } finally {
      setIsSplitting(false);
    }
  };

  const togglePageSelection = (pageNum: number) => {
    setSelectedPages(prev => 
      prev.includes(pageNum) 
        ? prev.filter(p => p !== pageNum) 
        : [...prev, pageNum]
    );
  };

  const selectedOp = ops.find(o => o.id === selectedOpId);

  return (
    <div className="flex flex-col h-screen bg-[#F5F5F7] overflow-hidden">
      {/* Top Toolbar */}
      <header className="h-14 bg-white border-b border-black/5 flex items-center justify-between px-4 z-50 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold tracking-tight">PDFForge</span>
          </div>
          <div className="h-6 w-[1px] bg-black/10 mx-2" />
          <div className="flex items-center gap-1 bg-black/5 p-1 rounded-lg">
            <ToolButton 
              icon={<Search className="w-4 h-4" />} 
              active={activeTool === 'select'} 
              onClick={() => setActiveTool('select')} 
              label="Select"
            />
            <ToolButton 
              icon={<Type className="w-4 h-4" />} 
              active={activeTool === 'add_text'} 
              onClick={() => setActiveTool('add_text')} 
              label="Text"
            />
            <ToolButton 
              icon={<Highlighter className="w-4 h-4" />} 
              active={activeTool === 'highlight'} 
              onClick={() => setActiveTool('highlight')} 
              label="Highlight"
            />
            <ToolButton 
              icon={<PenTool className="w-4 h-4" />} 
              active={activeTool === 'draw'} 
              onClick={() => setActiveTool('draw')} 
              label="Draw"
            />
            <ToolButton 
              icon={<ImageIcon className="w-4 h-4" />} 
              active={activeTool === 'place_image'} 
              onClick={() => setActiveTool('place_image')} 
              label="Image"
            />
            <ToolButton 
              icon={<Signature className="w-4 h-4" />} 
              active={activeTool === 'signature'} 
              onClick={() => setActiveTool('signature')} 
              label="Sign"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 mr-4">
            <button 
              onClick={undo}
              disabled={history.length === 0}
              title="Undo"
              className="p-2 hover:bg-black/5 rounded-lg transition-colors disabled:opacity-30"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button 
              onClick={redo}
              disabled={redoStack.length === 0}
              title="Redo"
              className="p-2 hover:bg-black/5 rounded-lg transition-colors disabled:opacity-30"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 mr-4">
            <button 
              onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))}
              className="p-2 hover:bg-black/5 rounded-lg transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button 
              onClick={() => setZoom(prev => Math.min(3, prev + 0.1))}
              className="p-2 hover:bg-black/5 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <button 
            onClick={() => setIsJobsOpen(!isJobsOpen)}
            className="relative p-2 hover:bg-black/5 rounded-lg transition-colors"
          >
            <Clock className="w-5 h-5" />
            {jobs.some(j => j.status === 'running') && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            )}
          </button>

          <button 
            onClick={() => setIsAiOpen(!isAiOpen)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all shadow-sm",
              isAiOpen ? "bg-black text-white" : "bg-amber-50 text-amber-600 hover:bg-amber-100"
            )}
          >
            <Sparkles className="w-4 h-4" />
            AI Assistant
          </button>

          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 bg-black/5 hover:bg-black/10 text-sm font-medium rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 bg-black text-white hover:bg-black/90 text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".pdf" 
            onChange={handleFileUpload} 
          />
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar - Thumbnails */}
        <aside className={cn(
          "bg-white border-r border-black/5 transition-all duration-300 flex flex-col shrink-0",
          isSidebarOpen ? "w-64" : "w-0 overflow-hidden"
        )}>
          <div className="p-4 border-b border-black/5 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-black/40">Pages</span>
            <div className="flex items-center gap-2">
              {selectedPages.length > 0 && (
                <button 
                  onClick={handleSplit}
                  disabled={isSplitting}
                  className="px-2 py-1 bg-black text-white text-[10px] font-bold rounded-md hover:bg-black/80 transition-colors flex items-center gap-1"
                >
                  {isSplitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
                  Split ({selectedPages.length})
                </button>
              )}
              <Layers className="w-4 h-4 text-black/20" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {pdfDoc ? Array.from({ length: pdfDoc.numPages }).map((_, i) => (
              <div key={i} className="relative group">
                <PdfThumbnail 
                  doc={pdfDoc}
                  pageNumber={i + 1}
                  isActive={currentPage === i + 1}
                  onClick={() => setCurrentPage(i + 1)}
                />
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePageSelection(i + 1);
                  }}
                  className={cn(
                    "absolute top-2 right-2 w-5 h-5 rounded-md border transition-all flex items-center justify-center",
                    selectedPages.includes(i + 1) 
                      ? "bg-black border-black text-white shadow-md" 
                      : "bg-white/80 border-black/10 text-transparent group-hover:text-black/20"
                  )}
                >
                  <CheckCircle2 className="w-3 h-3" />
                </button>
              </div>
            )) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-20">
                <FileText className="w-12 h-12 mb-4" />
                <p className="text-sm">No document loaded</p>
              </div>
            )}
          </div>
        </aside>

        {/* Main Viewport */}
        {pdfDoc ? (
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <PdfViewer 
              doc={pdfDoc}
              currentPage={currentPage}
              zoom={zoom}
              pan={{ x: 0, y: 0 }}
              ops={ops}
              onAddOp={addOperation}
              onUpdateOp={updateOp}
              activeTool={activeTool}
              selectedOpId={selectedOpId}
              onSelectOp={setSelectedOpId}
              onPageChange={setCurrentPage}
              onTextSelect={(text) => {
                setSelectedText(text);
                if (text && !isAiOpen) setIsAiOpen(true);
              }}
              notes={aiSession.notes}
            />
            
            {/* AI Selection Overlay */}
            <AnimatePresence>
              {selectedText && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-2xl border border-black/5 p-2 flex items-center gap-2 z-50"
                >
                  <div className="px-3 py-1 text-[10px] font-bold text-black/40 uppercase tracking-widest border-r border-black/5">
                    Selection
                  </div>
                  <button 
                    onClick={() => setIsAiOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    <Sparkles className="w-3 h-3" />
                    Explain
                  </button>
                  <button 
                    onClick={() => setIsAiOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Search className="w-3 h-3" />
                    Research
                  </button>
                  <button 
                    onClick={() => setSelectedText('')}
                    className="p-1.5 hover:bg-black/5 rounded-lg text-black/20"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Page Navigation Overlay */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-md border border-black/5 px-4 py-2 rounded-full shadow-lg flex items-center gap-4 z-40">
              <button 
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                className="p-1 hover:bg-black/5 rounded-full transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-medium min-w-[60px] text-center">
                {currentPage} / {pdfDoc.numPages}
              </span>
              <button 
                onClick={() => setCurrentPage(Math.min(pdfDoc.numPages, currentPage + 1))}
                className="p-1 hover:bg-black/5 rounded-full transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="w-[1px] h-4 bg-black/10" />
              <div className="flex items-center gap-2">
                <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="text-lg font-bold w-6 h-6 flex items-center justify-center hover:bg-black/5 rounded">-</button>
                <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="text-lg font-bold w-6 h-6 flex items-center justify-center hover:bg-black/5 rounded">+</button>
                <button 
                  onClick={() => { setZoom(1.0); }}
                  className="p-1 hover:bg-black/5 rounded ml-1"
                  title="Reset Zoom"
                >
                  <Undo2 className="w-3 h-3 rotate-90" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="max-w-md">
              <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-6 mx-auto">
                <Upload className="w-10 h-10 text-black/20" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight mb-2">Ready to edit?</h2>
              <p className="text-black/40 mb-8">Upload a PDF to start editing, signing, and converting with professional-grade tools.</p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-8 py-3 bg-black text-white rounded-2xl font-semibold hover:scale-105 transition-transform shadow-xl"
              >
                Select a File
              </button>
            </div>
          </div>
        )}

        {/* Right Sidebar - Properties & Ops */}
        <aside className="w-72 bg-white border-l border-black/5 flex flex-col shrink-0">
          <div className="p-4 border-b border-black/5">
            <span className="text-xs font-bold uppercase tracking-widest text-black/40">Properties</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {selectedOp ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-black/20 uppercase tracking-wider">Element Settings</span>
                  <button onClick={() => setSelectedOpId(null)} className="p-1 hover:bg-black/5 rounded">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                
                {selectedOp.type === 'add_text' && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-black/40 uppercase">Content</label>
                      <textarea 
                        value={selectedOp.text}
                        onChange={(e) => updateOp(selectedOp.id, { text: e.target.value })}
                        className="w-full p-2 bg-black/5 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-black/10 min-h-[80px]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-black/40 uppercase">Size</label>
                        <input 
                          type="number"
                          value={selectedOp.size}
                          onChange={(e) => updateOp(selectedOp.id, { size: parseInt(e.target.value) })}
                          className="w-full p-2 bg-black/5 rounded-lg text-xs font-medium"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-black/40 uppercase">Color</label>
                        <input 
                          type="color"
                          value={selectedOp.color}
                          onChange={(e) => updateOp(selectedOp.id, { color: e.target.value })}
                          className="w-full h-8 p-1 bg-black/5 rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-black/40 uppercase">Font Family</label>
                      <select 
                        value={selectedOp.fontFamily || 'Inter'}
                        onChange={(e) => updateOp(selectedOp.id, { fontFamily: e.target.value })}
                        className="w-full p-2 bg-black/5 rounded-lg text-xs font-medium"
                      >
                        <option value="Inter">Inter</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Courier New">Courier New</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Arial">Arial</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => updateOp(selectedOp.id, { fontWeight: selectedOp.fontWeight === 'bold' ? 'normal' : 'bold' })}
                        className={cn(
                          "flex-1 py-2 text-[10px] font-bold rounded-lg border transition-all",
                          selectedOp.fontWeight === 'bold' ? "bg-black text-white border-black" : "border-black/5 hover:border-black/20"
                        )}
                      >
                        Bold
                      </button>
                      <button 
                        onClick={() => updateOp(selectedOp.id, { fontStyle: selectedOp.fontStyle === 'italic' ? 'normal' : 'italic' })}
                        className={cn(
                          "flex-1 py-2 text-[10px] font-bold italic rounded-lg border transition-all",
                          selectedOp.fontStyle === 'italic' ? "bg-black text-white border-black" : "border-black/5 hover:border-black/20"
                        )}
                      >
                        Italic
                      </button>
                    </div>
                  </div>
                )}

                {selectedOp.type === 'signature' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-black/40 uppercase">Signature</label>
                      <button 
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                updateOp(selectedOp.id, { assetId: ev.target?.result as string });
                              };
                              reader.readAsDataURL(file);
                            }
                          };
                          input.click();
                        }}
                        className="text-[10px] font-bold text-blue-500 hover:underline"
                      >
                        Upload Image
                      </button>
                    </div>
                    
                    <SignaturePad 
                      onSave={(dataUrl) => updateOp(selectedOp.id, { assetId: dataUrl })}
                      onCancel={() => setSelectedOpId(null)}
                    />

                    <div className="p-4 border-2 border-dashed border-black/10 rounded-xl flex flex-col items-center justify-center bg-black/5 overflow-hidden">
                      {selectedOp.assetId === 'sig_default' ? (
                        <Signature className="w-8 h-8 text-black/20" />
                      ) : (
                        <img src={selectedOp.assetId} alt="Signature" className="max-h-20 object-contain" />
                      )}
                    </div>
                  </div>
                )}

                {selectedOp.type === 'draw' && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-black/40 uppercase">Stroke Width</label>
                      <div className="flex items-center gap-3">
                        <input 
                          type="range"
                          min="1"
                          max="20"
                          step="1"
                          value={selectedOp.width}
                          onChange={(e) => updateOp(selectedOp.id, { width: parseInt(e.target.value) })}
                          className="flex-1 h-1.5 bg-black/5 rounded-lg appearance-none cursor-pointer accent-black"
                        />
                        <span className="text-xs font-bold w-6 text-right">{selectedOp.width}px</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-black/40 uppercase">Color</label>
                      <input 
                        type="color"
                        value={selectedOp.color}
                        onChange={(e) => updateOp(selectedOp.id, { color: e.target.value })}
                        className="w-full h-8 p-1 bg-black/5 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                <button 
                  onClick={() => {
                    setOps(ops.filter(o => o.id !== selectedOp.id));
                    setSelectedOpId(null);
                  }}
                  className="w-full py-2 bg-red-50 text-red-500 text-xs font-bold rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Element
                </button>
              </div>
            ) : ops.length > 0 ? (
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-black/20 uppercase tracking-wider">Operation Log</span>
                {ops.map((op) => (
                  <div 
                    key={op.id} 
                    onClick={() => setSelectedOpId(op.id)}
                    className={cn(
                      "p-3 rounded-xl flex items-center justify-between group cursor-pointer transition-all",
                      selectedOpId === op.id ? "bg-black text-white shadow-md" : "bg-black/5 hover:bg-black/10"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shadow-sm",
                        selectedOpId === op.id ? "bg-white/10" : "bg-white"
                      )}>
                        {op.type === 'add_text' && <Type className="w-4 h-4" />}
                        {op.type === 'highlight' && <Highlighter className="w-4 h-4" />}
                        {op.type === 'draw' && <PenTool className="w-4 h-4" />}
                        {op.type === 'signature' && <Signature className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold capitalize">{op.type.replace('_', ' ')}</p>
                        <p className={cn(
                          "text-[10px]",
                          selectedOpId === op.id ? "text-white/40" : "text-black/40"
                        )}>Page {op.page} • {new Date(op.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-20">
                <FileText className="w-12 h-12 mb-4" />
                <p className="text-sm">Select an element to edit properties</p>
              </div>
            )}
          </div>
          <div className="p-4 bg-black/5 border-t border-black/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-black/40 uppercase tracking-wider">Document Info</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            </div>
            <p className="text-xs font-medium truncate">{file?.name || 'Untitled document'}</p>
            <p className="text-[10px] text-black/40 mt-1">{(file?.size || 0) / 1024 > 1024 ? `${((file?.size || 0) / 1024 / 1024).toFixed(2)} MB` : `${((file?.size || 0) / 1024).toFixed(2)} KB`}</p>
          </div>
        </aside>

        <AiAssistantPanel 
          isOpen={isAiOpen}
          onClose={() => setIsAiOpen(false)}
          context={{
            fullText,
            currentPageText,
            selectedText,
            mode: aiSession.mode,
            isExternalResearchEnabled: aiSession.isExternalResearchEnabled
          }}
          session={aiSession}
          onUpdateSession={setAiSession}
          onSaveNote={(note) => {
            const newNote: AiNote = {
              id: Math.random().toString(36).substring(7),
              text: note.text || '',
              page: currentPage,
              x: 50, // Default position
              y: 50,
              timestamp: Date.now()
            };
            setAiSession(prev => ({
              ...prev,
              notes: [...prev.notes, newNote]
            }));
          }}
        />

        {/* Job Queue Drawer */}
        <AnimatePresence>
          {isJobsOpen && (
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl border-l border-black/5 z-[60] flex flex-col"
            >
              <div className="p-4 border-b border-black/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span className="font-bold">Activity Fabric</span>
                </div>
                <button onClick={() => setIsJobsOpen(false)} className="p-2 hover:bg-black/5 rounded-full">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {jobs.length > 0 ? jobs.map(job => (
                  <div key={job.id} className="p-4 bg-black/5 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">{job.type}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-black/10 rounded-full font-mono">{job.id}</span>
                      </div>
                      {job.status === 'succeeded' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : job.status === 'running' ? (
                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-black/20" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="capitalize">{job.status}</span>
                        <span>{Math.round(job.progress)}%</span>
                      </div>
                      <div className="h-1.5 bg-black/10 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${job.progress}%` }}
                          className={cn(
                            "h-full transition-all duration-500",
                            job.status === 'succeeded' ? "bg-emerald-500" : "bg-blue-500"
                          )}
                        />
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-20">
                    <Clock className="w-12 h-12 mb-4" />
                    <p className="text-sm">No active jobs</p>
                  </div>
                )}
              </div>
              <div className="p-4 bg-black/5 border-t border-black/5">
                <p className="text-[10px] text-black/40 leading-relaxed">
                  Heavy transformations run in isolated worker pools. Viewport rendering remains low-latency.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function ToolButton({ icon, active, onClick, label }: { icon: React.ReactNode, active: boolean, onClick: () => void, label: string }) {
  return (
    <button 
      onClick={onClick}
      title={label}
      className={cn(
        "p-2 rounded-md transition-all flex items-center justify-center",
        active ? "bg-white text-black shadow-sm" : "text-black/40 hover:text-black hover:bg-white/50"
      )}
    >
      {icon}
    </button>
  );
}
