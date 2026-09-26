import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Eye, Brain, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TrackingConsentModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    const tauriEnv = '__TAURI_INTERNALS__' in window;
    setIsTauri(tauriEnv);
    const hasConsented = localStorage.getItem('prodify_tracking_consent') === 'true';
    if (!hasConsented) {
      setIsOpen(true);
    }
  }, []);

  const handleAgree = () => {
    localStorage.setItem('prodify_tracking_consent', 'true');
    setIsOpen(false);
  };

  const handleDecline = async () => {
    if (isTauri) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
      } catch (err) {
        window.close();
      }
    } else {
      window.location.href = 'https://google.com';
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/95 backdrop-blur-md p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          className="bg-[#111111] border border-[#2a2a2a] max-w-lg w-full p-8 shadow-2xl relative overflow-hidden"
        >
          {/* Subtle glow effect */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-[#e8ff47] to-transparent opacity-20" />

          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-[#e8ff47]/10 rounded-full">
              <Shield className="w-6 h-6 text-[#e8ff47]" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Privacy & Tracking Consent</h2>
          </div>

          <p className="text-[#a1a1aa] text-sm mb-8 leading-relaxed">
            To act as your intelligent AI focus coach, Prodify needs to observe your work environment. We take your privacy seriously and require your explicit consent for the following operations:
          </p>

          <div className="space-y-6 mb-8">
            <div className="flex gap-4">
              <Eye className="w-5 h-5 text-white shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Active Window Monitoring</h3>
                <p className="text-xs text-[#a1a1aa] leading-relaxed">
                  Prodify reads the titles of your currently active applications to detect distractions.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Brain className="w-5 h-5 text-white shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-white mb-1">AI Context Processing</h3>
                <p className="text-xs text-[#a1a1aa] leading-relaxed">
                  Window titles are securely sent to our Large Language Models (LLMs) to semantically determine if they align with your current goals.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Lock className="w-5 h-5 text-white shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Strict Data Isolation</h3>
                <p className="text-xs text-[#a1a1aa] leading-relaxed">
                  Your telemetry is solely used for your analytics and real-time coaching. It is never sold or used for cross-platform advertising.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-[#2a2a2a]">
            <Button
              onClick={handleDecline}
              variant="outline"
              className="flex-1 bg-transparent border-[#2a2a2a] text-white hover:bg-[#1a1a1a] rounded-none"
            >
              Exit App
            </Button>
            <Button
              onClick={handleAgree}
              className="flex-1 bg-[#e8ff47] hover:bg-[#e8ff47]/90 text-black font-bold rounded-none"
            >
              I Agree & Continue
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
