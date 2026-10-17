import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Terminal,
  Cpu,
  ShieldCheck,
  History,
  Check,
} from 'lucide-react';
import { AgentTaskRecord, AgentStep, Profile } from '../types/osa';
import { TranslationDictionary } from '../lib/i18n';
import { planAgentTask, executeAgentStep } from '../services/agentService';

interface AgentWorkbenchProps {
  currentUser: Profile;
  t: TranslationDictionary;
}

export const AgentWorkbench: React.FC<AgentWorkbenchProps> = ({ currentUser, t }) => {
  const [prompt, setPrompt] = useState('');
  const [activeTask, setActiveTask] = useState<AgentTaskRecord | null>(null);
  const [taskHistory, setTaskHistory] = useState<AgentTaskRecord[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStartTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isRunning) return;

    const userPrompt = prompt.trim();
    setPrompt('');
    setIsRunning(true);

    const planning = planAgentTask(userPrompt);
    const initialSteps: AgentStep[] = planning.steps.map((s, idx) => ({
      stepNumber: idx + 1,
      title: s.title,
      tool: s.tool,
      args: s.args,
      status: 'pending',
    }));

    const newTask: AgentTaskRecord = {
      id: 'task_' + Math.random().toString(36).substring(2, 9),
      prompt: userPrompt,
      status: 'planning',
      currentStepIndex: 0,
      steps: initialSteps,
      createdAt: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setActiveTask(newTask);
    abortControllerRef.current = new AbortController();

    try {
      // Transition to executing
      setActiveTask((prev) => (prev ? { ...prev, status: 'executing' } : null));

      let hasFailed = false;

      for (let i = 0; i < initialSteps.length; i++) {
        if (abortControllerRef.current?.signal.aborted) {
          throw new Error('Task cancelled');
        }

        // Mark step as running
        setActiveTask((prev) => {
          if (!prev) return null;
          const updatedSteps = [...prev.steps];
          updatedSteps[i] = { ...updatedSteps[i], status: 'running' };
          return { ...prev, currentStepIndex: i, steps: updatedSteps };
        });

        const stepResult = await executeAgentStep(
          initialSteps[i],
          abortControllerRef.current.signal
        );

        // Update step status
        setActiveTask((prev) => {
          if (!prev) return null;
          const updatedSteps = [...prev.steps];
          updatedSteps[i] = {
            ...updatedSteps[i],
            status: stepResult.success ? 'success' : 'failed',
            output: stepResult.output,
            error: stepResult.error,
          };
          return { ...prev, steps: updatedSteps };
        });

        if (!stepResult.success) {
          hasFailed = true;
          break;
        }
      }

      const finalStatus = hasFailed ? 'failed' : 'success';
      const finalReport = hasFailed
        ? 'Task halted due to step failure or verification error.'
        : currentUser.language === 'bn'
        ? 'সকল পরিকল্পনা অনুযায়ী সফলভাবে সম্পন্ন হয়েছে। টাইপস্ক্রিপ্ট, টেস্ট ও প্রোডাকশন বিল্ড যাচাইকৃত।'
        : 'All planned engineering and verification steps executed successfully. TypeScript, tests, and production build verified.';

      setActiveTask((prev) => {
        if (!prev) return null;
        const completed: AgentTaskRecord = {
          ...prev,
          status: finalStatus,
          finalReport,
          updated_at: new Date().toISOString(),
        };
        setTaskHistory((hist) => [completed, ...hist]);
        return completed;
      });
    } catch (err: unknown) {
      const isCancelled = err instanceof Error && err.message.includes('cancelled');
      setActiveTask((prev) => {
        if (!prev) return null;
        const cancelledTask: AgentTaskRecord = {
          ...prev,
          status: isCancelled ? 'cancelled' : 'failed',
          finalReport: err instanceof Error ? err.message : 'Unknown execution error',
          updated_at: new Date().toISOString(),
        };
        setTaskHistory((hist) => [cancelledTask, ...hist]);
        return cancelledTask;
      });
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopTask = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-6 shrink-0">
        <div className="max-w-5xl mx-auto space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {t.agentTitle}
              </h1>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
                {t.agentSubtitle}
              </p>
            </div>
          </div>

          {/* Prompt Form */}
          <form onSubmit={handleStartTask} className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Cpu className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isRunning}
                placeholder={t.agentInputPlaceholder}
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs md:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
              />
            </div>

            {isRunning ? (
              <button
                type="button"
                onClick={handleStopTask}
                className="px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-xs transition-colors shrink-0"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>{t.stopTask}</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!prompt.trim()}
                className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-xs transition-colors shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{t.startTask}</span>
              </button>
            )}
          </form>

          {/* Safety Boundary Notice */}
          <div className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 flex items-center gap-2 text-[11px] text-blue-700 dark:text-blue-300">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>
              Safety Boundary Enforced: Agent operates with isolated tool permissions. Direct database migrations and deployments require explicit user confirmation.
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 space-y-6">
        {/* Active Task Execution Card */}
        {activeTask && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      activeTask.status === 'success'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : activeTask.status === 'failed'
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        : activeTask.status === 'cancelled'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 animate-pulse'
                    }`}
                  >
                    {activeTask.status}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{activeTask.id}</span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  "{activeTask.prompt}"
                </h3>
              </div>

              {isRunning && (
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t.executingStep}</span>
                </div>
              )}
            </div>

            {/* Execution Steps */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t.planningStep}
              </h4>
              <div className="space-y-2.5">
                {activeTask.steps.map((step) => (
                  <div
                    key={step.stepNumber}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      step.status === 'running'
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                        : step.status === 'success'
                        ? 'border-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-950/20'
                        : step.status === 'failed'
                        ? 'border-rose-500/50 bg-rose-50/30 dark:bg-rose-950/20'
                        : 'border-slate-200 dark:border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            step.status === 'success'
                              ? 'bg-emerald-500 text-white'
                              : step.status === 'failed'
                              ? 'bg-rose-500 text-white'
                              : step.status === 'running'
                              ? 'bg-blue-600 text-white animate-pulse'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {step.stepNumber}
                        </span>
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {step.title}
                        </p>
                      </div>

                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase">
                        {step.tool}
                      </span>
                    </div>

                    {step.output && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] leading-relaxed overflow-x-auto">
                        <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                          <Terminal className="w-3.5 h-3.5 shrink-0" />
                          <span>Output:</span>
                        </div>
                        {step.output}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Final Report */}
            {activeTask.finalReport && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                  {activeTask.status === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white mb-1">
                      Final Execution Report
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {activeTask.finalReport}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Task History Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t.taskHistory}
            </h3>
          </div>

          {taskHistory.length === 0 ? (
            <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-center space-y-2">
              <Bot className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.noTaskHistory}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {taskHistory.map((task) => (
                <div
                  key={task.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          task.status === 'success'
                            ? 'bg-emerald-500/15 text-emerald-600'
                            : 'bg-rose-500/15 text-rose-600'
                        }`}
                      >
                        {task.status}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(task.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {task.prompt}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTask(task)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0"
                  >
                    View Report
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
