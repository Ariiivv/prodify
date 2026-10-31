import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { drawerVariants, backdropVariants } from '@/lib/motion';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

/**
 * Slide-over Drawer with spring animation.
 * Used to keep primary page views dense and uncluttered by tucking
 * deeper logs, histories, and chats into right-side slide-over panels.
 */
export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'md',
  className = '',
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const widthClasses = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full',
  }[width];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-xs"
            aria-hidden="true"
          />

          {/* Slide-over Panel */}
          <motion.aside
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label={title || 'Panel'}
            className={`relative z-10 flex h-full w-full ${widthClasses} flex-col border-l border-line bg-card shadow-xl ${className}`}
          >
            {/* Header */}
            {(title || subtitle) && (
              <div className="flex items-center justify-between border-b border-line px-6 py-5">
                <div className="min-w-0 pr-4">
                  {title && (
                    <h2 className="text-lg font-semibold tracking-tight text-ink font-body">
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="mt-0.5 text-xs text-muted font-body">
                      {subtitle}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close drawer"
                  className="rounded-full p-2 text-muted hover:bg-black/5 hover:text-ink transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {children}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
