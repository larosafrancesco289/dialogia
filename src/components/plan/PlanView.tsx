'use client';
import { SparklesIcon, PlayIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import type { LearningPlan, LearnerModel, LearningPlanNode } from '@/lib/types';
import {
  isNodeReady,
  getAllPrerequisites,
  getNextNode,
  calculatePlanProgress,
} from '@/lib/learningPlan/service';
import { PlanNode } from './PlanNode';
import { useMemo } from 'react';

export function PlanView({
  plan,
  onNodeStatusChange,
  onStartLesson,
  learnerModel,
}: {
  plan: LearningPlan;
  onNodeStatusChange?: (nodeId: string, status: 'not_started' | 'in_progress' | 'completed') => void;
  onStartLesson?: (nodeId: string) => void;
  learnerModel?: LearnerModel;
}) {
  const nextNode = getNextNode(plan);
  const allCompleted = plan.nodes.every((n) => n.status === 'completed');
  const progress = useMemo(() => calculatePlanProgress(plan), [plan]);
  const totalTopics = plan.nodes.length;

  const phases = useMemo(() => {
    const groups: { name: string; nodes: LearningPlanNode[] }[] = [];
    let currentGroup: { name: string; nodes: LearningPlanNode[] } | null = null;
    let fallbackGroup: { name: string; nodes: LearningPlanNode[] } | null = null;

    plan.nodes.forEach((node) => {
      const match = node.name.match(/^(Phase|Module|Part|Section)\s+(\d+|[A-Za-z]+):?\s*(.*)/i);
      if (match) {
        const phaseName = `${match[1]} ${match[2]}`;
        if (!currentGroup || currentGroup.name !== phaseName) {
          if (currentGroup) groups.push(currentGroup);
          currentGroup = { name: phaseName, nodes: [] };
        }
        currentGroup.nodes.push(node);
      } else {
        if (currentGroup) {
          currentGroup.nodes.push(node);
        } else {
          if (!fallbackGroup) fallbackGroup = { name: 'Topics', nodes: [] };
          fallbackGroup.nodes.push(node);
        }
      }
    });

    if (currentGroup) groups.push(currentGroup);
    if (fallbackGroup) {
      if (groups.length === 0) {
        groups.push(fallbackGroup);
      } else {
        groups.unshift(fallbackGroup);
      }
    }
    
    if (groups.length === 1 && groups[0].name === 'Topics') {
       groups[0].name = 'Your Journey';
    }

    return groups;
  }, [plan.nodes]);

  const getMastery = (nodeId: string) => {
    if (!learnerModel) return undefined;
    const m = learnerModel.mastery[nodeId];
    return m ? { confidence: m.confidence } : undefined;
  };

  // Metadata badges with theme variables instead of hardcoded tailwind colors
  const metadataBadges = [
    plan.metadata?.difficulty && { 
      label: plan.metadata.difficulty, 
      className: 'bg-[color-mix(in_oklab,var(--color-accent)_10%,var(--color-surface))] text-[var(--color-accent)] border-[color-mix(in_oklab,var(--color-accent)_20%,var(--color-border))]' 
    },
    plan.metadata?.estimatedHours && { 
      label: `~${plan.metadata.estimatedHours}h`, 
      className: 'bg-[color-mix(in_oklab,var(--color-accent-2)_10%,var(--color-surface))] text-[var(--color-accent-2)] border-[color-mix(in_oklab,var(--color-accent-2)_20%,var(--color-border))]' 
    },
    { 
      label: `${totalTopics} topics`, 
      className: 'bg-muted text-muted-foreground border-border' 
    },
  ].filter(Boolean) as { label: string; className: string }[];

  return (
    <div className="space-y-10">
      {/* Modern Hero Header */}
      <header className="relative space-y-6">
        <div className="space-y-3">
           {/* Title Area */}
          <div>
             <h1 className="text-xl font-bold tracking-tight text-foreground leading-tight">
               Learning Journey
             </h1>
             <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
               {plan.goal}
             </p>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 pt-1">
            {metadataBadges.map((badge, i) => (
              <span
                key={i}
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
          
          {/* Progress */}
          <div className="mt-4 flex items-center gap-4">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/50">
              <div 
                className="h-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)] transition-all duration-500"
                style={{ width: `${progress.percentComplete}%` }}
              />
            </div>
            <div className="text-xs font-medium text-muted-foreground tabular-nums">
              {progress.percentComplete}% complete
            </div>
          </div>
        </div>

        {/* "Up Next" Callout Card */}
        {nextNode && !allCompleted && (
          <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-surface p-5 shadow-sm transition-all hover:shadow-md">
            {/* Background Pattern */}
            <div 
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl"
              style={{ background: 'color-mix(in oklab, var(--color-accent) 5%, transparent)' }}
            />
            <div className="pointer-events-none absolute right-0 top-0 p-6 opacity-[0.05]">
               <SparklesIcon className="h-32 w-32" />
            </div>

            <div className="relative z-10">
               <div className="flex items-center gap-2 mb-3">
                 <span 
                   className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                   style={{ 
                     background: 'color-mix(in oklab, var(--color-accent) 10%, transparent)', 
                     color: 'var(--color-accent)' 
                   }}
                 >
                   <SparklesIcon className="h-3 w-3" />
                   Current Focus
                 </span>
               </div>
               
               <h2 className="text-lg font-semibold text-foreground mb-2">
                 {nextNode.name}
               </h2>
               
               {nextNode.description && (
                 <p className="mb-5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                   {nextNode.description}
                 </p>
               )}

               <button
                  type="button"
                  onClick={() => {
                     if (onStartLesson) onStartLesson(nextNode.id);
                     else onNodeStatusChange?.(nextNode.id, 'in_progress');
                  }}
                  className="group/btn inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:brightness-110 active:scale-95"
                >
                  <PlayIcon className="h-4 w-4" />
                  {nextNode.status === 'in_progress' ? 'Continue Lesson' : 'Start Lesson'}
                </button>
            </div>
          </div>
        )}

        {/* Completion Hero */}
        {allCompleted && (
          <div 
            className="relative overflow-hidden rounded-2xl border p-8 text-center"
            style={{
              background: 'color-mix(in oklab, var(--color-accent) 5%, var(--color-surface))',
              borderColor: 'color-mix(in oklab, var(--color-accent) 20%, transparent)'
            }}
          >
            <div 
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{
                 background: 'color-mix(in oklab, var(--color-accent) 20%, transparent)',
                 color: 'var(--color-accent)'
              }}
            >
              <CheckCircleIcon className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Journey Completed!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You have mastered all topics in this learning plan. Great job!
            </p>
          </div>
        )}
      </header>

      {/* Timeline */}
      <div className="space-y-8 pl-2">
         {phases.map((phase, groupIdx) => (
           <section key={groupIdx} className="relative">
             {/* Phase Header */}
             {phases.length > 1 && (
               <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-border font-mono text-xs font-bold text-muted-foreground shadow-sm">
                    {groupIdx + 1}
                  </div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    {phase.name}
                  </h4>
                  <div className="h-px flex-1 bg-border/40" />
               </div>
             )}
             
             {/* Nodes */}
             <div className={`space-y-0 ${phases.length > 1 ? 'ml-4 border-l border-dashed border-border/40 pl-6' : ''}`}>
               {phase.nodes.map((node, idx) => {
                 const ready = isNodeReady(node.id, plan);
                 const prerequisites = getAllPrerequisites(node.id, plan);
                 const isLast = idx === phase.nodes.length - 1 && groupIdx === phases.length - 1;

                 return (
                   <PlanNode
                     key={node.id}
                     node={node}
                     isReady={ready}
                     prerequisites={prerequisites}
                     onStatusChange={
                       onNodeStatusChange ? (status) => onNodeStatusChange(node.id, status) : undefined
                     }
                     onStartLesson={onStartLesson}
                     mastery={getMastery(node.id)}
                     isLast={isLast}
                   />
                 );
               })}
             </div>
           </section>
         ))}
      </div>
    </div>
  );
}
