'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyIcon, XMarkIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { SparklesIcon } from '@heroicons/react/24/solid';
import { useTier } from '@/lib/auth/tierContext';
import { verifyAccessCode, getAccessCodeErrorMessage } from '@/lib/auth/access.client';
import styles from './MobileFreeTierBanner.module.css';

const STORAGE_KEY = 'dialogia-free-tier-banner-collapsed';

/**
 * MobileFreeTierBanner - Mobile-optimized collapsible banner for free-tier users.
 * Features a floating pill when collapsed and a full-width expanded form.
 */
export function MobileFreeTierBanner() {
  const { isFreeTier, isLoading } = useTier();
  const [collapsed, setCollapsed] = useState(true);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setCollapsed(stored === 'true');
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    if (!next) {
      setTimeout(() => inputRef.current?.focus(), 250);
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
        setTimeout(() => window.location.replace('/'), 600);
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || !isFreeTier) return null;

  return (
    <AnimatePresence mode="wait">
      {collapsed ? (
        <motion.button
          key="collapsed"
          className={styles.collapsedPill}
          onClick={toggleCollapsed}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: [0.2, 0.7, 0, 1] }}
        >
          <KeyIcon className={styles.pillIcon} />
          <span className={styles.pillText}>Have a code?</span>
        </motion.button>
      ) : (
        <motion.div
          key="expanded"
          className={styles.expandedBanner}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0.7, 0, 1] }}
        >
          <div className={styles.bannerContent}>
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <span className={styles.headerIcon}>
                  <SparklesIcon />
                </span>
                <div className={styles.headerText}>
                  <span className={styles.title}>Unlock Full Access</span>
                  <span className={styles.subtitle}>Enter your access code</span>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={toggleCollapsed}
                aria-label="Collapse"
              >
                <XMarkIcon />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className={styles.form}>
              <input
                ref={inputRef}
                type="text"
                inputMode="text"
                autoComplete="off"
                className={styles.input}
                placeholder="Access code"
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
                  'Unlocked!'
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
            </form>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  className={styles.error}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
