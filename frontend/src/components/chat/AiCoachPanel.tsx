import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Bot, User, Loader2, Sparkles, AlertTriangle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { useAuthStore } from '@/store/authStore';
import ReactMarkdown from 'react-markdown';

const quickActions = [
  "What's my burnout risk?",
  "How can I improve focus?",
  "Give me a motivational boost",
  "Suggest a productivity tip",
];

interface AiCoachPanelProps {
  workspaceId?: number;
  focusMinutes: number;
  distractionCount: number;
  burnoutProbability: number;
  currentState: string;
  sessionCount: number;
  workspaceName: string;
  idleSeconds?: number;
  timeRemainingString?: string;
  workDuration?: number;
  breakDuration?: number;
  targetHours?: number;
  themeColor?: string;
  currentTabTitle?: string;
  focusKeywords?: string[];
  isTabDistracted?: boolean;
}

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function AiCoachPanel({
  workspaceId,
  focusMinutes,
  distractionCount,
  burnoutProbability,
  currentState,
  sessionCount,
  workspaceName,
  idleSeconds = 0,
  timeRemainingString = '00:00',
  workDuration = 25,
  breakDuration = 5,
  targetHours = 0,
  themeColor = 'violet',
  currentTabTitle = '',
  focusKeywords = [],
  isTabDistracted = false,
}: AiCoachPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localDistractionCount, setLocalDistractionCount] = useState(0);
  const [hasGreeted, setHasGreeted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && !hasGreeted && messages.length === 0) {
      if (workspaceId) {
        fetch(`${API_BASE}/workspaces/${workspaceId}/chat-history`, { headers: getAuthHeaders() })
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data) && data.length > 0) {
              const history = data.map(msg => ({ role: msg.role, content: msg.content }));
              setMessages(history);
            } else {
              setMessages([{
                role: 'assistant',
                content: `${getTimeOfDayGreeting()}! I'm your Star ML Coach. Let's make this ${workDuration}-minute session highly productive. How can I support your focus today?`
              }]);
            }
            setHasGreeted(true);
          })
          .catch(err => {
            console.error('Failed to load chat history:', err);
            const greeting = `${getTimeOfDayGreeting()}! I'm your Star ML Coach. Let's make this ${workDuration}-minute session highly productive. How can I support your focus today?`;
            setMessages([{ role: 'assistant', content: greeting }]);
            setHasGreeted(true);
          });
      } else {
        const greeting = `${getTimeOfDayGreeting()}! I'm your Star ML Coach. Let's make this ${workDuration}-minute session highly productive. How can I support your focus today?`;
        setMessages([{ role: 'assistant', content: greeting }]);
        setHasGreeted(true);
      }
    }
  }, [isOpen, hasGreeted, messages.length, workspaceId, workDuration]);

  const prevTimerState = useRef(currentState);
  useEffect(() => {
    if (currentState === 'SESSION_COMPLETED' && prevTimerState.current !== 'SESSION_COMPLETED') {
      setIsOpen(true);
      setIsLoading(true);
      
      const debriefPayload = {
        message: `SYSTEM_DEBRIEF`,
        workspace_name: workspaceName,
        context: {
          distractionCount: localDistractionCount + distractionCount,
          focusMinutes,
          burnoutProbability,
          currentState,
          sessionCount,
          idleSeconds,
          workDuration,
          breakDuration,
          targetHours,
          isDebrief: true
        }
      };

      const runDebrief = async () => {
        try {
          const token = await useAuthStore.getState().getAccessToken();
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const res = await fetch(`${API_BASE}/api/ai-coach/chat`, {
            method: 'POST',
            headers,
            body: JSON.stringify(debriefPayload),
          });
          const data = await res.json();
          setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
        } catch (error) {
          console.error('Debrief error:', error);
        } finally {
          setIsLoading(false);
        }
      };
      runDebrief();
    }
    prevTimerState.current = currentState;
  }, [currentState, workspaceName, localDistractionCount, distractionCount, focusMinutes, burnoutProbability, sessionCount, idleSeconds, workDuration, breakDuration, targetHours]);

  const isSendingRef = useRef(false);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || isSendingRef.current) return;
    isSendingRef.current = true;

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    if (workspaceId) {
      fetch(`${API_BASE}/workspaces/${workspaceId}/chat-history`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ role: 'user', content: text })
      }).catch(console.error);
    }

    try {
      const payload = {
        message: text,
        context: {
          distractionCount: localDistractionCount + distractionCount,
          timeLeft: timeRemainingString,
          workspaceName: workspaceName || 'Default',
          workspaceMode: currentState?.includes('BREAK') ? 'Break' : 'Structured',
          focusMinutes,
          burnoutProbability,
          currentState,
          sessionCount,
          idleSeconds,
          focusDuration: workDuration,
          breakDuration,
          targetHours,
          themeColor,
          currentTabTitle,
          focusKeywords,
        },
      };
      const token = await useAuthStore.getState().getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE}/api/ai-coach/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error('Prodify Intelligence API error:', response.status, errText);
        let errorDetails = errText;
        try {
          const parsed = JSON.parse(errText);
          errorDetails = parsed.detail || parsed.response || errText;
        } catch (e) {}
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ **API Error (${response.status})**: ${errorDetails}` }]);
        setIsLoading(false);
        return;
      }
      const data = await response.json();
      const reply = data.response || data.message || data.reply || `⚠️ **Format Error**: Received empty or unrecognized response format from the server.`;

      // Detect distraction-related keywords in the AI reply
      const lowerReply = reply.toLowerCase();
      if (lowerReply.includes('looked away') || lowerReply.includes('distracted')) {
        setLocalDistractionCount(prev => prev + 1);
      }

      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      
      if (workspaceId) {
        fetch(`${API_BASE}/workspaces/${workspaceId}/chat-history`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ role: 'assistant', content: reply })
        }).catch(console.error);
      }
    } catch (error) {
      console.error('Failed to communicate with Prodify backend:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ **Connection Error**: Unable to reach the Prodify Intelligence backend. Please ensure the FastAPI server is running.` }]);
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
    }
  };

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-24 md:bottom-8 right-6 z-40 w-14 h-14 rounded-none bg-[#e8ff47] shadow-lg shadow-black/50 flex items-center justify-center text-black"
          >
            <Zap className="w-6 h-6 fill-current" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-24 md:bottom-8 right-4 md:right-6 z-40 w-[calc(100%-2rem)] md:w-96 h-[32rem] bg-[#111111] border border-[#2a2a2a] rounded-none shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a2a] bg-[#161616]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-none bg-[#e8ff47]/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-[#e8ff47]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Prodify Intelligence</h3>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 uppercase tracking-widest mt-0.5">Workspace AI</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && !hasGreeted && (
                <div className="text-center py-8">
                  <Bot className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">Ask me anything about your focus session</p>
                  <div className="space-y-2">
                    {quickActions.map((action) => (
                      <button
                        key={action}
                        onClick={() => sendMessage(action)}
                        className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                msg.role === 'divider' ? (
                  <div key={i} className="flex items-center justify-center py-2 opacity-50">
                    <div className="h-px bg-border/50 flex-1" />
                    <span className="px-3 text-[10px] text-muted-foreground uppercase tracking-widest">{msg.content}</span>
                    <div className="h-px bg-border/50 flex-1" />
                  </div>
                ) : (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                      <Zap className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-none px-4 py-2.5 text-sm leading-relaxed border ${
                    msg.role === 'user'
                      ? 'bg-[#e8ff47] text-black border-[#e8ff47]'
                      : 'bg-[#1a1a1a] text-white border-[#2a2a2a]'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-[13px] font-medium">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-none bg-[#e8ff47] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                      <User className="w-3.5 h-3.5 text-black" />
                    </div>
                  )}
                </motion.div>
                )
              ))}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2 items-start"
                >
                  <div className="w-7 h-7 rounded-none bg-[#e8ff47]/10 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Zap className="w-3.5 h-3.5 text-[#e8ff47]" />
                  </div>
                  <div className="bg-[#1a1a1a] rounded-none px-4 py-3 border border-[#2a2a2a]">
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <motion.div
                          key={i}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                          className="w-1.5 h-1.5 rounded-full bg-[#e8ff47]"
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-[#2a2a2a] bg-[#161616]">
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
                className="flex gap-2"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Prodify Intelligence..."
                  className="flex-1 bg-[#1a1a1a] border-[#2a2a2a] text-white rounded-none text-sm h-10 focus-visible:ring-1 focus-visible:ring-[#e8ff47]"
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={isLoading || !input.trim()}
                  className="bg-[#e8ff47] hover:bg-[#e8ff47]/90 text-black rounded-none h-10 w-10 flex-shrink-0"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : <Send className="w-4 h-4" />}
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
