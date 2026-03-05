/**
 * AI Analysis Panel — Ollama Local LLM (streaming)
 *
 * Analysis tab: tokens stream in real-time via EventSource (GET SSE)
 * Chat tab:     tokens stream via fetch + ReadableStream (POST SSE)
 * AbortController cancels in-flight requests on unmount / new request
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, Send, RefreshCw, ChevronDown, Zap, AlertCircle, CheckCircle2, XCircle, Loader2, MessageSquare, BarChart2, Square } from 'lucide-react';
import clsx from 'clsx';
import type { AIChatMessage, OllamaStatus } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAnalysisText(text: string): React.ReactNode[] {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <br key={i} />;

    // === Section headers ===
    if (/^===.*===$/.test(line.trim())) {
      return (
        <div key={i} className="mt-3 mb-1 text-accent font-semibold text-xs uppercase tracking-widest opacity-80">
          {line.replace(/===/g, '').trim()}
        </div>
      );
    }
    // Bullet signals
    if (line.startsWith('[BULLISH]') || line.startsWith('[BEARISH]') || line.startsWith('[NEUTRAL]') || line.startsWith('[WARNING]')) {
      const colorMap: Record<string, string> = {
        '[BULLISH]': 'text-bullish',
        '[BEARISH]': 'text-bearish',
        '[NEUTRAL]': 'text-neutral',
        '[WARNING]': 'text-warning',
      };
      const tag = Object.keys(colorMap).find(k => line.startsWith(k)) || '';
      return (
        <p key={i} className={clsx('text-xs', colorMap[tag])}>
          {line}
        </p>
      );
    }
    // Bold numbered pts / bullet points
    if (/^\d+\./.test(line.trim()) || line.trim().startsWith('-') || line.trim().startsWith('•')) {
      return (
        <p key={i} className="text-xs text-text-secondary pl-3 leading-relaxed">
          {line}
        </p>
      );
    }
    return (
      <p key={i} className="text-xs text-text-secondary leading-relaxed">
        {line}
      </p>
    );
  });
}

// ── SSE reader — parses NDJSON event stream from fetch response ───────────────
async function readSSEStream(
  response: Response,
  onToken: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader  = response.body!.getReader();
  const decoder = new TextDecoder();
  let   buf     = '';

  try {
    while (true) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const obj = JSON.parse(line.slice(6));
            if (obj.text) onToken(obj.text);
          } catch { /* skip */ }
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AIAnalysis() {
  const [status, setStatus]               = useState<OllamaStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [tab, setTab]                     = useState<'analysis' | 'chat'>('analysis');

  // Analysis tab
  const [analysisText, setAnalysisText]   = useState<string>('');
  const [analysisMeta, setAnalysisMeta]   = useState<{ model: string; ts: string } | null>(null);
  const [analyzing, setAnalyzing]         = useState(false);
  const [analyzeError, setAnalyzeError]   = useState<string | null>(null);
  const analyzeAbortRef                   = useRef<AbortController | null>(null);

  // Chat tab
  const [chatMessages, setChatMessages]   = useState<AIChatMessage[]>([]);
  const [chatInput, setChatInput]         = useState('');
  const [chatLoading, setChatLoading]     = useState(false);
  const [chatError, setChatError]         = useState<string | null>(null);
  const chatAbortRef                      = useRef<AbortController | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  // ── Ollama status (poll every 30s) ────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      setStatusLoading(true);
      const res  = await fetch(`${API_URL}/ai/status`);
      const json = await res.json();
      if (json.success) {
        setStatus(json.data as OllamaStatus);
        setSelectedModel(prev =>
          prev ? prev
            : json.data.models?.[0] ?? json.data.defaultModel ?? ''
        );
      }
    } catch {
      setStatus({ ollamaRunning: false, models: [], defaultModel: 'codegemma:7b', endpoint: 'http://localhost:11434' });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 30_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Cleanup on unmount
  useEffect(() => () => {
    analyzeAbortRef.current?.abort();
    chatAbortRef.current?.abort();
  }, []);

  // ── Streaming analysis (EventSource GET) ─────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!status?.ollamaRunning || analyzing) return;

    analyzeAbortRef.current?.abort();
    const ac = new AbortController();
    analyzeAbortRef.current = ac;

    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalysisText('');
    setAnalysisMeta(null);

    const url = `${API_URL}/ai/analyze/stream${selectedModel ? `?model=${encodeURIComponent(selectedModel)}` : ''}`;

    try {
      const res = await fetch(url, { signal: ac.signal });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      // Read the SSE stream — first event is 'start', then 'token', then 'done'
      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let   buf     = '';
      let   eventType = '';

      while (true) {
        if (ac.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const obj = JSON.parse(line.slice(6));
              if (eventType === 'start') {
                setAnalysisMeta({ model: obj.model, ts: obj.ts });
              } else if (eventType === 'token' && obj.text) {
                setAnalysisText(prev => prev + obj.text);
              } else if (eventType === 'error') {
                setAnalyzeError(obj.message || 'LLM error');
              }
            } catch { /* skip */ }
            eventType = '';
          }
        }
      }
      reader.cancel().catch(() => {});
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        setAnalyzeError((err as Error).message || 'Stream error');
      }
    } finally {
      setAnalyzing(false);
    }
  }, [status?.ollamaRunning, analyzing, selectedModel]);

  const handleStopAnalysis = () => {
    analyzeAbortRef.current?.abort();
    setAnalyzing(false);
  };

  // ── Streaming chat (fetch POST → SSE) ────────────────────────────────────
  const handleSend = useCallback(async () => {
    const content = chatInput.trim();
    if (!content || chatLoading || !status?.ollamaRunning) return;

    chatAbortRef.current?.abort();
    const ac = new AbortController();
    chatAbortRef.current = ac;

    const userMsg: AIChatMessage = { role: 'user', content, timestamp: new Date().toISOString() };
    const history = [...chatMessages, userMsg];
    setChatMessages(history);
    setChatInput('');
    setChatLoading(true);
    setChatError(null);

    // Add a placeholder assistant message we'll fill token-by-token
    const assistantPlaceholder: AIChatMessage = { role: 'assistant', content: '', timestamp: new Date().toISOString() };
    setChatMessages(prev => [...prev, assistantPlaceholder]);
    const assistantIdx = history.length; // index in the state array after adding placeholder

    try {
      const res = await fetch(`${API_URL}/ai/chat/stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model: selectedModel || undefined, messages: history.map(m => ({ role: m.role, content: m.content })) }),
        signal:  ac.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      await readSSEStream(
        res,
        (token) => {
          setChatMessages(prev => {
            const updated = [...prev];
            updated[assistantIdx] = { ...updated[assistantIdx], content: updated[assistantIdx].content + token };
            return updated;
          });
        },
        ac.signal,
      );
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        setChatError((err as Error).message || 'Stream error');
        // Remove empty placeholder on error
        setChatMessages(prev => prev.filter((_, i) => !(i === assistantIdx && !prev[i].content)));
      }
    } finally {
      setChatLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [chatInput, chatLoading, status?.ollamaRunning, chatMessages, selectedModel]);

  const handleStopChat = () => {
    chatAbortRef.current?.abort();
    setChatLoading(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const isOnline = status?.ollamaRunning ?? false;

  return (
    <div className="trading-card flex flex-col h-full min-h-[480px]">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="trading-card-header mb-0">
          <Bot className="w-3.5 h-3.5 text-accent" />
          AI Market Analyst
          <span className="text-[10px] text-text-muted font-normal ml-1">· Ollama</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Status */}
          {statusLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin" />
          ) : isOnline ? (
            <span className="flex items-center gap-1 text-[10px] text-bullish font-medium">
              <CheckCircle2 className="w-3 h-3" /> Online
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-bearish">
              <XCircle className="w-3 h-3" /> Offline
            </span>
          )}

          {/* Model picker */}
          {isOnline && (
            <div className="relative">
              <button
                onClick={() => setShowModelMenu(v => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-card border border-border text-[10px] text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
              >
                <span className="max-w-[90px] truncate">{selectedModel || '…'}</span>
                <ChevronDown className="w-3 h-3 flex-shrink-0" />
              </button>
              {showModelMenu && (
                <div className="absolute right-0 top-7 z-50 min-w-[150px] bg-card border border-border rounded-xl shadow-card text-xs overflow-hidden">
                  {(status?.models?.length ? status.models : [status?.defaultModel || 'codegemma:7b']).map(m => (
                    <button key={m} onClick={() => { setSelectedModel(m); setShowModelMenu(false); }}
                      className={clsx('w-full text-left px-3 py-2 hover:bg-border/40 transition-colors truncate', selectedModel === m ? 'text-accent font-medium' : 'text-text-secondary')}>
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button onClick={fetchStatus} title="Refresh status" className="text-text-muted hover:text-accent transition-colors">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Offline notice ───────────────────────────────────────────────── */}
      {!statusLoading && !isOnline && (
        <div className="mb-3 p-3 bg-bearish/10 border border-bearish/30 rounded-xl text-xs text-text-secondary space-y-1">
          <div className="flex items-center gap-1.5 text-bearish font-semibold">
            <AlertCircle className="w-3.5 h-3.5" /> Ollama is not running
          </div>
          <p>1. Install: <a href="https://ollama.ai" target="_blank" rel="noreferrer" className="text-accent underline">ollama.ai</a></p>
          <p>2. Run: <code className="bg-card px-1 rounded">ollama serve</code></p>
          <p>3. Pull model: <code className="bg-card px-1 rounded">ollama pull codegemma:7b</code></p>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-3">
        {(['analysis', 'chat'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              tab === t ? 'bg-accent/20 text-accent border border-accent/30' : 'text-text-muted hover:text-text-secondary hover:bg-card')}>
            {t === 'analysis' ? <BarChart2 className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
            {t === 'analysis' ? 'Analysis' : 'Chat'}
          </button>
        ))}
      </div>

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* Analysis Tab                                                       */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {tab === 'analysis' && (
        <div className="flex flex-col flex-1 min-h-0 gap-3">

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={handleAnalyze} disabled={!isOnline || analyzing}
              className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all',
                isOnline && !analyzing ? 'bg-accent hover:bg-accent-glow text-white shadow-accent' : 'bg-card text-text-muted cursor-not-allowed border border-border')}>
              {analyzing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                : <><Zap className="w-4 h-4" /> Generate Market Analysis</>}
            </button>
            {analyzing && (
              <button onClick={handleStopAnalysis} title="Stop generation"
                className="px-3 py-2.5 rounded-xl bg-bearish/20 border border-bearish/40 text-bearish hover:bg-bearish/30 transition-colors">
                <Square className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {analyzeError && (
            <div className="p-3 bg-bearish/10 border border-bearish/30 rounded-xl text-xs text-bearish">{analyzeError}</div>
          )}

          {/* Streaming text output */}
          {(analysisText || analyzing) && (
            <div className="flex-1 overflow-y-auto pr-1">
              {analysisMeta && (
                <div className="mb-2 text-[10px] text-text-muted">
                  {new Date(analysisMeta.ts).toLocaleTimeString('en-IN')} · {analysisMeta.model}
                  {analyzing && <span className="ml-1 text-accent animate-pulse">● streaming</span>}
                </div>
              )}
              <div className="space-y-0.5 text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                {analysisText}
                {analyzing && <span className="inline-block w-0.5 h-3.5 bg-accent animate-pulse ml-0.5 align-middle" />}
              </div>
            </div>
          )}

          {!analysisText && !analyzing && !analyzeError && (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-text-muted py-6">
              <Bot className="w-8 h-8 mb-3 opacity-30" />
              <p className="text-sm">Click &quot;Generate Market Analysis&quot;</p>
              <p className="text-xs mt-1 opacity-60">AI analyses live NIFTY data in real-time — tokens appear as they generate</p>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* Chat Tab                                                           */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {tab === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0">

          {/* Message list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-3">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-text-muted py-8">
                <MessageSquare className="w-8 h-8 mb-3 opacity-30" />
                <p className="text-sm">Ask anything about the market</p>
                <p className="text-xs mt-1 opacity-60">e.g. &quot;What does the PCR suggest?&quot; or &quot;Explain the OI pattern&quot;</p>
              </div>
            )}

            {chatMessages.map((msg, i) => (
              <div key={i} className={clsx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={clsx('max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-accent/20 text-text-primary rounded-br-sm border border-accent/30'
                    : 'bg-card text-text-secondary rounded-bl-sm border border-border')}>
                  {msg.content}
                  {/* Blinking cursor on the live assistant message */}
                  {msg.role === 'assistant' && chatLoading && i === chatMessages.length - 1 && (
                    <span className="inline-block w-0.5 h-3.5 bg-accent animate-pulse ml-0.5 align-middle" />
                  )}
                </div>
              </div>
            ))}

            {chatError && <div className="text-xs text-bearish text-center py-1">{chatError}</div>}
            <div ref={chatEndRef} />
          </div>

          {/* Input bar */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <input ref={inputRef} type="text" value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={isOnline ? 'Ask about the market…' : 'Ollama offline'}
              disabled={!isOnline || chatLoading}
              className="flex-1 bg-card border border-border rounded-xl px-3 py-2 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
            />
            {chatLoading ? (
              <button onClick={handleStopChat} title="Stop"
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-bearish/20 border border-bearish/40 text-bearish flex-shrink-0">
                <Square className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button onClick={handleSend} disabled={!chatInput.trim() || !isOnline}
                className={clsx('w-8 h-8 flex items-center justify-center rounded-xl transition-all flex-shrink-0',
                  chatInput.trim() && isOnline ? 'bg-accent hover:bg-accent-glow text-white' : 'bg-card text-text-muted cursor-not-allowed border border-border')}>
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
