'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyIcon, ChevronDownIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { SparklesIcon } from '@heroicons/react/24/solid';
import { useTier } from '@/lib/auth/tierContext';
import { verifyAccessCode, getAccessCodeErrorMessage } from '@/lib/auth/access.client';
import styles from './FreeTierBanner.module.css';

const STORAGE_KEY = 'dialogia-free-tier-banner-collapsed';

/**
 * FreeTierBanner - Collapsible banner for free-tier users to enter an access code.
 * Only visible when user is on the free tier.
 * Follows the Imperial Archive design aesthetic.
 */
export function FreeTierBanner() {
  const { isFreeTier, isLoading } = useTier();
  const [collapsed, setCollapsed] = useState(true); // Start collapsed to avoid flash
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check stored preference
    const stored = localStorage.getItem(STORAGE_KEY);
    // Default to expanded on first visit
    setCollapsed(stored === 'true');
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    // Focus input when expanding
    if (!next) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const plain = code.trim();
    if (!plain) {
      setError('Please enter a code');
      return;
    }
    setLoading(true);
    try {
      const result = await verifyAccessCode(plain);
      if (!result.ok) {
        setError(getAccessCodeErrorMessage(result.error));
      } else {
        setSuccess(true);
        // Force full navigation so the new cookie is sent
        setTimeout(() => window.location.replace('/'), 600);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Don't render while loading tier or if not free tier
  if (isLoading || !isFreeTier) return null;

  return (
    <div className={styles.banner}>
      <AnimatePresence mode="wait" initial={false}>
        {collapsed ? (
          <motion.button
            key="collapsed"
            className={styles.collapsedTrigger}
            onClick={toggleCollapsed}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <span className={styles.collapsedIcon}>
              <KeyIcon />
            </span>
            <span className={styles.collapsedText}>Have an access code?</span>
            <ChevronDownIcon className={styles.chevron} />
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            className={styles.expandedContent}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0.7, 0, 1] }}
          >
            <div className={styles.expandedInner}>
              <div className={styles.headerRow}>
                <div className={styles.headerLeft}>
                  <span className={styles.headerIcon}>
                    <SparklesIcon />
                  </span>
                  <div className={styles.headerText}>
                    <span className={styles.headerTitle}>Unlock Full Access</span>
                    <span className={styles.headerSubtitle}>
                      Enter your code to access all models and features
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.collapseButton}
                  onClick={toggleCollapsed}
                  aria-label="Collapse banner"
                >
                  <ChevronDownIcon className={styles.chevronUp} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.inputWrapper}>
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    className={styles.input}
                    placeholder="Enter access code"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      if (error) setError(null);
                    }}
                    disabled={loading || success}
                  />
                  <button
                    type="submit"
                    disabled={loading || success || !code.trim()}
                    className={styles.submitButton}
                  >
                    {success ? (
                      <span className={styles.successText}>Unlocked!</span>
                    ) : loading ? (
                      <span className={styles.loadingDots}>
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : (
                      <>
                        <span>Unlock</span>
                        <ArrowRightIcon className={styles.arrowIcon} />
                      </>
                    )}
                  </button>
                </div>
                <AnimatePresence>
                  {error && (
                    <motion.p
                      className={styles.error}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
