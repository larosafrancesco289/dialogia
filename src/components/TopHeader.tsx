'use client';
import { TopHeaderView } from '@/components/top-header/TopHeaderView';
import { useTopHeaderState } from '@/components/top-header/useTopHeaderState';

export function TopHeader() {
  const state = useTopHeaderState();
  return <TopHeaderView {...state} />;
}
