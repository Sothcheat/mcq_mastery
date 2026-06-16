import React, { useState } from 'react';
import { useStore } from '../store';
import { Button } from './ui/button';
import { CheckCircle2, XCircle, MinusCircle, RefreshCcw, UploadCloud } from 'lucide-react';

export function ResultsView() {
  const { questions, answers, durationMinutes, timerRemainingSeconds, resetExam, resetAll } = useStore();
  const [filter, setFilter] = useState<'all' | 'correct' | 'incorrect' | 'skipped'>('all');

  const correctAnswers = questions.filter(q => answers[q.id] === q.answer);
  const incorrectAnswers = questions.filter(q => answers[q.id] && answers[q.id] !== q.answer);
  const skippedAnswers = questions.filter(q => !answers[q.id]);
  const scorePercentage = Math.round((correctAnswers.length / questions.length) * 100) || 0;

  const totalTimeTaken = (durationMinutes * 60) - timerRemainingSeconds;
  const timeTakenMinutes = Math.floor(totalTimeTaken / 60);
  const timeTakenSeconds = totalTimeTaken % 60;

  const filteredQuestions = questions.filter(q => {
    if (filter === 'correct') return answers[q.id] === q.answer;
    if (filter === 'incorrect') return answers[q.id] && answers[q.id] !== q.answer;
    if (filter === 'skipped') return !answers[q.id];
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <div className="bg-surface p-8 rounded-2xl border border-muted/20 shadow-sm text-center space-y-4">
        <h2 className="text-3xl font-bold">Results</h2>
        <div className="text-5xl font-extrabold text-accent">{scorePercentage}%</div>
        <p className="text-lg font-medium text-muted">
          {correctAnswers.length} / {questions.length} correct
        </p>
        <p className="text-sm text-muted">
          Time taken: {timeTakenMinutes}m {timeTakenSeconds}s
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
        <FilterTab label={`Correct (${correctAnswers.length})`} active={filter === 'correct'} onClick={() => setFilter('correct')} className="data-[active=true]:bg-correct/10 data-[active=true]:text-correct data-[active=true]:border-correct" />
        <FilterTab label={`Incorrect (${incorrectAnswers.length})`} active={filter === 'incorrect'} onClick={() => setFilter('incorrect')} className="data-[active=true]:bg-wrong/10 data-[active=true]:text-wrong data-[active=true]:border-wrong" />
        <FilterTab label={`Skipped (${skippedAnswers.length})`} active={filter === 'skipped'} onClick={() => setFilter('skipped')} />
      </div>

      <div className="space-y-6">
        {filteredQuestions.map((q) => {
          const userAnswer = answers[q.id];
          const isCorrect = userAnswer === q.answer;
          const isSkipped = !userAnswer;

          return (
            <div key={q.id} className="bg-surface p-6 rounded-xl border border-muted/20 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-medium leading-relaxed">
                  <span className="font-semibold text-accent mr-2">Q{q.id}.</span>
                  {q.question}
                </h3>
                {isCorrect ? <CheckCircle2 className="w-6 h-6 text-correct shrink-0" /> :
                  isSkipped ? <MinusCircle className="w-6 h-6 text-muted shrink-0" /> :
                    <XCircle className="w-6 h-6 text-wrong shrink-0" />}
              </div>

              <div className="space-y-2 pt-2">
                {q.options.map((opt, i) => {
                  let bgClass = "bg-bg border-muted/20 text-muted";
                  if (opt === q.answer) bgClass = "bg-correct/10 border-correct text-correct font-medium shadow-sm";
                  else if (opt === userAnswer && !isCorrect) bgClass = "bg-wrong/10 border-wrong text-wrong font-medium shadow-sm";

                  return (
                    <div key={i} className={`p-3 rounded-lg border ${bgClass} flex justify-between items-center transition-colors`}>
                      <span className="leading-snug">{opt}</span>
                      {opt === q.answer && <span className="text-xs font-bold uppercase tracking-wider shrink-0 ml-4">Correct Answer</span>}
                      {opt === userAnswer && !isCorrect && <span className="text-xs font-bold uppercase tracking-wider shrink-0 ml-4">Your Answer</span>}
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
