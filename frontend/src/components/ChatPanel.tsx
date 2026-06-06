import React, { useState } from 'react';
import { API_BASE } from '@/lib/config';

interface ChatPanelProps {
  focusMinutes: number;
  distractionCount: number;
  burnoutProbability: number;
  currentState: string;
  sessionCount: number;
  workspaceName: string;
  workspaceMode: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ focusMinutes, distractionCount, burnoutProbability, currentState, sessionCount, workspaceName, workspaceMode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<{ sender: string; text: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const quickActionChips = [
    "What's my current burnout risk?",
    "How can I improve my focus?",
    "Summarize my session stats.",
    "Give me a motivational quote."
  ];

  const togglePanel = () => {
    setIsOpen(!isOpen);
  };

  const handleSendMessage = async (text: string) => {
    if (text.trim() === '') return;

    const userMessage = { sender: 'user', text: text };
    setChatHistory((prev) => [...prev, userMessage]);
    setMessage(""); // Clear input immediately
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/ai-coach/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          focus_minutes: focusMinutes,
          distraction_count: distractionCount,
          burnout_probability: burnoutProbability,
          current_state: currentState,
          session_count: sessionCount,
          workspace_name: workspaceName,
          workspace_mode: workspaceMode,
          message: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const aiMessage = { sender: "ai", text: data.response };
      setChatHistory((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      setChatHistory((prev) => [...prev, { sender: "ai", text: "Connection error. Is the backend running?" }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChipClick = (chipMessage: string) => {
    handleSendMessage(chipMessage);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        className="bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 px-4 rounded-full shadow-lg transition-all duration-200 ease-in-out transform hover:scale-105"
        onClick={togglePanel}
      >
        {isOpen ? "Close Coach" : "Open Coach"}
      </button>

      <div
        className={`fixed bottom-20 right-6 w-80 h-96 bg-slate-900 border border-slate-800 rounded-lg shadow-xl flex flex-col transform transition-all duration-300 ${
          isOpen
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "translate-y-4 opacity-0 pointer-events-none"
        }`}
      >
        <div className="p-4 bg-slate-800 text-white rounded-t-lg flex justify-between items-center border-b border-slate-700">
          <h3 className="font-bold">AI Coach</h3>
          <button onClick={togglePanel} className="text-slate-400 hover:text-white transition-colors duration-200">×</button>
        </div>
        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
          {chatHistory.map((msg, index) => (
            <div key={index} className={`mb-2 ${msg.sender === "user" ? "text-right" : "text-left"}`}>
              <span
                className={`inline-block p-2 rounded-lg max-w-[75%] ${
                  msg.sender === "user" ? "bg-violet-600 text-white" : "bg-slate-700 text-slate-100"
                }`}
              >
                {msg.text}
              </span>
            </div>
          ))}
          {isLoading && (
            <div className="text-left mb-2">
              <span className="inline-block p-2 rounded-lg bg-slate-700 text-slate-100">
                <span className="flex space-x-1 items-center h-4">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </span>
              </span>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-800">
          <div className="flex flex-wrap gap-2 mb-2">
            {quickActionChips.map((chip, index) => (
              <button
                key={index}
                className="px-3 py-1 bg-slate-700 text-slate-300 rounded-full text-sm hover:bg-slate-600 transition-colors duration-200"
                onClick={() => handleChipClick(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <div className="flex">
            <input
              type="text"
              className="flex-1 p-3 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSendMessage(message);
                }
              }}
            />
            <button
              className="ml-2 bg-violet-600 hover:bg-violet-700 text-white font-bold py-2 px-4 rounded-xl transition-all duration-200 ease-in-out transform hover:scale-105"
              onClick={() => handleSendMessage(message)}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
