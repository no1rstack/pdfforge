import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Send, 
  X, 
  Search, 
  BookOpen, 
  Activity, 
  HelpCircle, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Save,
  Trash2,
  AlertCircle,
  Globe
} from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { AiMessage, AiMode, AiSession, AiNote } from '../types/pdf';
import { generateAiResponse, GeminiContext } from '../services/gemini';

interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  context: GeminiContext;
  session: AiSession;
  onUpdateSession: (session: AiSession) => void;
  onSaveNote: (note: Partial<AiNote>) => void;
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  isOpen,
  onClose,
  context,
  session,
  onUpdateSession,
  onSaveNote
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session.messages]);

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isLoading) return;

    const userMsg: AiMessage = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      text: text.trim(),
      timestamp: Date.now()
    };

    const updatedMessages = [...session.messages, userMsg];
    onUpdateSession({ ...session, messages: updatedMessages });
    setInput('');
    setIsLoading(true);

    try {
      const response = await generateAiResponse(text, session.messages, context);
      onUpdateSession({ ...session, messages: [...updatedMessages, response] });
    } catch (error) {
      console.error('AI Error:', error);
      const errorMsg: AiMessage = {
        id: Math.random().toString(36).substring(7),
        role: 'model',
        text: "I'm sorry, I encountered an error. Please try again.",
        timestamp: Date.now()
      };
      onUpdateSession({ ...session, messages: [...updatedMessages, errorMsg] });
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = (mode: AiMode) => {
    onUpdateSession({ ...session, mode });
  };

  const handleResearchToggle = () => {
    onUpdateSession({ ...session, isExternalResearchEnabled: !session.isExternalResearchEnabled });
  };

  const clearChat = () => {
    onUpdateSession({ ...session, messages: [] });
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 border-l border-black/5 bg-white flex flex-col h-full shadow-2xl z-50">
      {/* Header */}
      <div className="p-4 border-b border-black/5 flex items-center justify-between bg-black text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-widest">AI Assistant</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Controls */}
      <div className="p-4 border-b border-black/5 space-y-4 bg-black/[0.02]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-black/40" />
            <span className="text-[10px] font-bold text-black/40 uppercase tracking-wider">Analysis Mode</span>
          </div>
          <div className="flex bg-white rounded-lg p-0.5 border border-black/5 shadow-sm">
            {(['learn', 'analyze', 'assist'] as AiMode[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold rounded-md transition-all capitalize",
                  session.mode === m ? "bg-black text-white shadow-sm" : "text-black/40 hover:text-black"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
      >
        {session.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-30 p-4">
            <Sparkles className="w-10 h-10 mb-4" />
            <p className="text-xs font-medium">How can I help you with this document today?</p>
            <div className="mt-6 grid grid-cols-1 gap-2 w-full">
              <button 
                onClick={() => handleSend("Summarize this document")}
                className="p-2 bg-black/5 rounded-lg text-[10px] font-bold hover:bg-black/10 transition-colors"
              >
                Summarize Document
              </button>
              <button 
                onClick={() => handleSend("What are the key takeaways?")}
                className="p-2 bg-black/5 rounded-lg text-[10px] font-bold hover:bg-black/10 transition-colors"
              >
                Key Takeaways
              </button>
            </div>
          </div>
        ) : (
          session.messages.map((msg) => (
            <div 
              key={msg.id}
              className={cn(
                "flex flex-col gap-1 max-w-[90%]",
                msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              <div className={cn(
                "p-3 rounded-2xl text-xs leading-relaxed",
                msg.role === 'user' 
                  ? "bg-black text-white rounded-tr-none" 
                  : "bg-black/5 text-black rounded-tl-none border border-black/5"
              )}>
                <div className="markdown-body">
                  <Markdown>{msg.text}</Markdown>
                </div>
                
                {msg.isGrounding && msg.groundingUrls && (
                  <div className="mt-3 pt-3 border-t border-black/10 space-y-1">
                    <p className="text-[9px] font-bold text-black/40 uppercase">Sources</p>
                    {msg.groundingUrls.map((url, i) => (
                      <a 
                        key={i} 
                        href={url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[9px] text-blue-500 hover:underline truncate"
                      >
                        <ExternalLink className="w-2 h-2" />
                        {new URL(url).hostname}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 px-1">
                <span className="text-[8px] text-black/20">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {msg.role === 'model' && (
                  <button 
                    onClick={() => onSaveNote({ text: msg.text })}
                    className="p-1 hover:bg-black/5 rounded text-black/40 hover:text-black transition-colors"
                    title="Save as note"
                  >
                    <Save className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-black/40">
              <div className="w-1 h-1 bg-black/40 rounded-full animate-bounce" />
              <div className="w-1 h-1 bg-black/40 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-1 h-1 bg-black/40 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
            {session.isExternalResearchEnabled && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg w-fit"
              >
                <Search className="w-3 h-3 text-emerald-600 animate-pulse" />
                <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest">Searching Google...</span>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-black/5 bg-white space-y-3">
        {/* Refined Toggle Placement */}
        <div className={cn(
          "rounded-xl p-2.5 border transition-all duration-300",
          session.isExternalResearchEnabled 
            ? "bg-emerald-50/50 border-emerald-500/20 shadow-sm" 
            : "bg-black/[0.02] border-black/5"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300",
                session.isExternalResearchEnabled 
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                  : "bg-black/5 text-black/40"
              )}>
                <Globe className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-black uppercase tracking-wider">External Research</span>
                  <div className="group relative">
                    <HelpCircle className="w-3 h-3 text-black/20 cursor-help" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-black text-white text-[9px] rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none shadow-2xl leading-tight">
                      Allows the AI to supplement document context with real-time information from the web.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-black" />
                    </div>
                  </div>
                </div>
                <p className="text-[8px] text-black/40 leading-none mt-0.5">Supplement PDF with live web data</p>
              </div>
            </div>
            <button 
              onClick={handleResearchToggle}
              className={cn(
                "w-9 h-5 rounded-full relative transition-all duration-500",
                session.isExternalResearchEnabled ? "bg-emerald-500" : "bg-black/10"
              )}
            >
              <motion.div 
                layout
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className={cn(
                  "absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm",
                  session.isExternalResearchEnabled ? "right-1" : "left-1"
                )} 
              />
            </button>
          </div>
        </div>

        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask anything about the PDF..."
            className="w-full p-3 pr-10 bg-black/5 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-black/10 min-h-[44px] max-h-32 resize-none"
          />
          <button 
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 bottom-2 p-2 bg-black text-white rounded-lg disabled:opacity-20 transition-all hover:scale-105 active:scale-95"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-[8px] text-black/40">Context: {context.selectedText ? 'Selection' : 'Full Document'}</p>
            {context.selectedText && (
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => handleSend(`Define this term: "${context.selectedText}"`)}
                  className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 text-[8px] font-bold rounded border border-amber-200 hover:bg-amber-100 transition-colors"
                >
                  <BookOpen className="w-2 h-2" />
                  Define Term
                </button>
                <button 
                  onClick={() => handleSend(`Find related information for: "${context.selectedText}"`)}
                  className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 text-[8px] font-bold rounded border border-blue-200 hover:bg-blue-100 transition-colors"
                >
                  <Search className="w-2 h-2" />
                  Find Related Info
                </button>
              </div>
            )}
          </div>
          <button 
            onClick={clearChat}
            className="text-[8px] font-bold text-black/20 hover:text-red-500 transition-colors uppercase tracking-widest"
          >
            Clear Chat
          </button>
        </div>
      </div>
    </div>
  );
};
