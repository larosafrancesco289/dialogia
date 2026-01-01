'use client';
import { MobileHeaderView } from '@/components/mobile/MobileHeaderView';
import { useMobileHeaderState } from '@/components/mobile/useMobileHeaderState';

export function MobileHeader() {
  const state = useMobileHeaderState();
  return <MobileHeaderView {...state} />;
}
