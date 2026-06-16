import { useState } from 'react';
import { useStore } from '../store';
import { Button } from './ui/button';
import { CheckCircle2, MinusCircle, RefreshCcw, UploadCloud } from 'lucide-react';

export function ResultsView() {
  const { questions, answers, durationMinutes, timerRemainingSeconds, resetExam, resetAll } = useStore();
  const [filter, setFilter] = useState<'all' | 'answered' | 'skipped'>('all');

  const answeredQuestions = questions.filter(q => answers[q.id]);
  const skippedQuestions = questions.filter(q => !answers[q.id]);

  const totalTimeTaken = (durationMinutes * 60) - timerRemainingSeconds;
  const timeTakenMinutes = Math.floor(totalTimeTaken / 60);
  const timeTakenSeconds = totalTimeTaken % 60;

  const filteredQuestions = questions.filter(q => {
    if (filter === 'answered') return !!answers[q.id];
    if (filter === 'skipped') return !answers[q.id];
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <div className="bg-surface p-8 rounded-2xl border border-muted/20 shadow-sm text-center space-y-4">
        <h2 className="text-3xl font-bold">Your Answers</h2>
        <p className="text-lg font-medium text-muted">
          Answered {answeredQuestions.length} / {questions.length}
          {skippedQuestions.length > 0 && <> · Skipped {skippedQuestions.length}</>}
        </p>
        <p className="text-sm text-muted">
          Time taken: {timeTakenMinutes}m {timeTakenSeconds}s
        </p>
        <p className="text-sm text-muted">
          Check your selected answers below against your own answer sheet.
        </p>

        <div className="pt-6 flex flex-col sm:flex-row justify-center gap-4">
          <Button onClick={resetExam} variant="outline" className="flex items-center gap-2 border-muted/30 hover:bg-muted/5">
            <RefreshCcw className="w-4 h-4" /> Retake Exam
          </Button>
          <Button onClick={resetAll} className="bg-accent text-white hover:bg-accent/90 flex items-center gap-2">
            <UploadCloud className="w-4 h-4" /> Upload New PDF
          </Button>
        </div>
      </div>

      <div className="flex justify-center gap-2 flex-wrap">
        <FilterTab label={`All (${questions.length})`} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterTab label={`Answered (${answeredQuestions.length})`} active={filter === 'answered'} onClick={() => setFilter('answered')} />
        <FilterTab label={`Skipped (${skippedQuestions.length})`} active={filter === 'skipped'} onClick={() => setFilter('skipped')} />
      </div>

      <div className="space-y-6">
        {filteredQuestions.map((q) => {
          const userAnswer = answers[q.id];
          const isSkipped = !userAnswer;

          return (
            <div key={q.id} className="bg-surface p-6 rounded-xl border border-muted/20 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-medium leading-relaxed">
                  <span className="font-semibold text-accent mr-2">Q{q.id}.</span>
                  {q.question}
                </h3>
                {isSkipped
                  ? <MinusCircle className="w-6 h-6 text-muted shrink-0" />
                  : <CheckCircle2 className="w-6 h-6 text-accent shrink-0" />}
              </div>

              <div className="space-y-2 pt-2">
                {q.options.map((opt, i) => {
                  const isPicked = opt === userAnswer;
                  const bgClass = isPicked
                    ? "bg-accent/10 border-accent text-accent font-medium shadow-sm"
                    : "bg-bg border-muted/20 text-muted";

                  return (
                    <div key={i} className={`p-3 rounded-lg border ${bgClass} flex justify-between items-center transition-colors`}>
                      <span className="leading-snug">{opt}</span>
                      {isPicked && <span className="text-xs font-bold uppercase tracking-wider shrink-0 ml-4">Your Answer</span>}
                    </div>
                  );
                })}
              </div>

              {isSkipped && (
                <div className="mt-2 inline-block px-3 py-1 bg-muted/10 text-muted rounded-md text-sm font-medium">
                  Not answered
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterTab({ label, active, onClick, className = '' }: { label: string, active: boolean, onClick: () => void, className?: string }) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors focus-visible:outline-2 focus-visible:outline-accent ${active ? 'bg-text text-bg border-text' : 'bg-surface text-muted border-muted/30 hover:border-muted/60'
        } ${className}`}
    >
      {label}
    </button>
  );
}
