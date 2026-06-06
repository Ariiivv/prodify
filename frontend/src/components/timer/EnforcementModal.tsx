import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

interface EnforcementModalProps {
  show: boolean;
  onDismiss: () => void;
}

export default function EnforcementModal({ show, onDismiss }: EnforcementModalProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl"
          >
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            
            <h2 className="text-xl font-bold text-white mb-2">Focus Interrupted</h2>
            <p className="text-sm text-zinc-400 mb-6">
              A tab switch or distraction was detected. Your focus session has been paused.
            </p>

            <button
              onClick={onDismiss}
              className="w-full bg-blue-600 text-white h-11 px-8 rounded-2xl flex items-center justify-center font-medium hover:bg-blue-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Focus
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}