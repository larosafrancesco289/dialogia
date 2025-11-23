'use client';
import { LearnerModel, LearningPlan, TopicMastery } from '@/lib/types';
import { 
  ChartBarIcon, 
  CheckCircleIcon, 
  ClockIcon, 
  ExclamationTriangleIcon, 
  SparklesIcon 
} from '@heroicons/react/24/outline';

export function LearnerModelView({
  learnerModel,
  plan,
}: {
  learnerModel: LearnerModel;
  plan: LearningPlan;
}) {
  const masteryEntries = Object.values(learnerModel.mastery || {});
  
  // Calculate global stats
  const totalInteractions = masteryEntries.reduce((acc, m) => acc + (m.interactions || 0), 0);
  const avgConfidence = masteryEntries.length 
    ? masteryEntries.reduce((acc, m) => acc + (m.confidence || 0), 0) / masteryEntries.length
    : 0;
  const masteredTopics = masteryEntries.filter((m) => (m.confidence || 0) >= 0.8).length;
  
  return (
    <div className="space-y-8">
      {/* Header / Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border bg-surface/50 space-y-1">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
            <SparklesIcon className="w-3.5 h-3.5" />
            Mastery Score
          </div>
          <div className="text-2xl font-semibold text-foreground">
            {Math.round(avgConfidence * 100)}%
          </div>
        </div>
        
        <div className="p-4 rounded-xl border border-border bg-surface/50 space-y-1">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircleIcon className="w-3.5 h-3.5" />
            Topics Mastered
          </div>
          <div className="text-2xl font-semibold text-foreground">
            {masteredTopics} <span className="text-base font-normal text-muted-foreground">/ {plan.nodes.length}</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-surface/50 space-y-1">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
            <ClockIcon className="w-3.5 h-3.5" />
            Interactions
          </div>
          <div className="text-2xl font-semibold text-foreground">
            {totalInteractions}
          </div>
        </div>
      </div>

      {/* Topics List */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ChartBarIcon className="w-4 h-4 text-muted-foreground" />
          Topic Breakdown
        </h3>
        
        <div className="space-y-3">
          {plan.nodes.map((node) => {
            const mastery = learnerModel.mastery?.[node.id];
            const confidence = mastery?.confidence || 0;
            const pct = Math.round(confidence * 100);
            
            const barColor = 
              confidence >= 0.8 ? 'bg-green-500' :
              confidence >= 0.4 ? 'bg-amber-500' :
              'bg-red-500';
              
            const statusText = 
              confidence >= 0.8 ? 'Mastered' :
              confidence >= 0.4 ? 'Developing' :
              'Needs Practice';

            return (
              <div 
                key={node.id}
                className="p-4 rounded-lg border border-border bg-surface hover:bg-surface/80 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-medium text-sm text-foreground">{node.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{mastery?.interactions || 0} interactions</span>
                      {mastery?.misconceptions && mastery.misconceptions.length > 0 && (
                        <span className="text-amber-500 flex items-center gap-1">
                          <ExclamationTriangleIcon className="w-3 h-3" />
                          {mastery.misconceptions.length} misconception{mastery.misconceptions.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold font-mono">{pct}%</div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {statusText}
                    </div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`} 
                    style={{ width: `${pct}%`, opacity: 0.8 }}
                  />
                </div>

                {/* Recent Evidence / Misconceptions */}
                {mastery && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                     {mastery.misconceptions && mastery.misconceptions.length > 0 && (
                        <div className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 p-2 rounded border border-amber-500/20">
                          <strong>Misconception detected:</strong> {mastery.misconceptions[0].description}
                        </div>
                     )}
                     
                     {mastery.evidence && mastery.evidence.length > 0 && (
                       <div className="text-xs text-muted-foreground">
                         <span className="font-medium text-foreground">Latest:</span> {mastery.evidence[mastery.evidence.length - 1].details}
                       </div>
                     )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

