import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Bot, User, Loader2, Sparkles, AlertTriangle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API_BASE } from '@/lib/config';
import ReactMarkdown from 'react-markdown';

const quickActions = [
  "What's my burnout risk?",
  "How can I improve focus?",
  "Give me a motivational boost",
  "Suggest a productivity tip",
];

interface AiCoachPanelProps {
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
  focusMinutes,
  distractionCount,
  burnoutProbability,
  currentState,
  sessionCount,
  workspaceName,
  idleSeconds = 0,
  timeRemainingString = '00:00',
  workDuration = 45,
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
      const greeting = `${getTimeOfDayGreeting()}, Pranav. I'm your Prodify Intelligence. Let's optimize your flow.`;
      setMessages([{ role: 'assistant', content: greeting }]);
      setHasGreeted(true);
    }
  }, [isOpen, hasGreeted, messages.length]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

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
      const response = await fetch(`${API_BASE}/api/ai-coach/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error('Prodify Intelligence API error:', response.status, errText);
        setMessages(prev => [...prev, { role: 'assistant', content: `I'm here to help you stay focused. (API returned ${response.status})` }]);
        setIsLoading(false);
        return;
      }
      const data = await response.json();
      const reply = data.response || data.message || data.reply || `Your burnout probability is ${(burnoutProbability * 100).toFixed(0)}%. ${burnoutProbability > 0.7 ? 'Take a break — your risk is high.' : burnoutProbability > 0.4 ? 'Moderate risk. Consider a short pause.' : 'You are in a good zone. Keep going!'}`;

      // Detect distraction-related keywords in the AI reply
      const lowerReply = reply.toLowerCase();
      if (lowerReply.includes('looked away') || lowerReply.includes('distracted')) {
        setLocalDistractionCount(prev => prev + 1);
      }

      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: `Your burnout probability is ${(burnoutProbability * 100).toFixed(0)}%. ${burnoutProbability > 0.7 ? 'Take a break immediately — your risk is high.' : burnoutProbability > 0.4 ? 'Moderate risk. Consider a short pause.' : 'You are in a good zone. Keep going!'}` }]);
    } finally {
      setIsLoading(false);
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
            className="fixed bottom-24 md:bottom-8 right-6 z-40 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30 flex items-center justify-center text-white"
          >
            <Zap className="w-6 h-6" />
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
            className="fixed bottom-24 md:bottom-8 right-4 md:right-6 z-40 w-[calc(100%-2rem)] md:w-96 h-[30rem] bg-card border border-border/50 rounded-2xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-gradient-to-r from-indigo-500/10 via-primary/10 to-cyan-500/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-foreground bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Prodify Intelligence</h3>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider">Online</span>
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground/70">Context-aware AI · Workspace: {workspaceName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span className="text-[10px] font-medium text-amber-400">
                    {localDistractionCount + distractionCount} disruptions
                  </span>
                </div>
                <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
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
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-white rounded-br-md shadow-sm shadow-primary/20'
                      : 'bg-gradient-to-r from-secondary/60 to-secondary/40 text-foreground rounded-bl-md border border-border/30'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-[13px]">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                      <User className="w-3.5 h-3.5 text-accent" />
                    </div>
                  )}
                </motion.div>
              ))}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2 items-start"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Zap className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="bg-gradient-to-r from-secondary/60 to-secondary/40 rounded-2xl rounded-bl-md px-4 py-3 border border-border/30">
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <motion.div
                          key={i}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                          className="w-1.5 h-1.5 rounded-full bg-indigo-400"
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border/50 bg-gradient-to-r from-indigo-500/5 to-cyan-500/5">
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
                className="flex gap-2"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Prodify Intelligence..."
                  className="flex-1 bg-secondary/60 border-border/50 rounded-xl text-sm h-10 placeholder:text-muted-foreground/50"
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={isLoading || !input.trim()}
                  className="bg-gradient-to-br from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 rounded-xl h-10 w-10 flex-shrink-0 shadow-lg shadow-indigo-500/20"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}