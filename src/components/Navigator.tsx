import React from 'react';
import { useStore } from '../store';

interface NavigatorProps {
  totalPages: number;
  currentPage: number;
  setCurrentPage: (p: number) => void;
  questionsPerPage: number;
}

export function Navigator({ currentPage, setCurrentPage, questionsPerPage }: NavigatorProps) {
  const questions = useStore(state => state.questions);
  const answers = useStore(state => state.answers);

  return (
    <div className="flex flex-wrap gap-2 justify-center py-4 px-2 bg-surface rounded-xl border border-muted/20 shadow-sm">
      {questions.map((q, idx) => {
        const isAnswered = !!answers[q.id];
        const pageOfQuestion = Math.floor(idx / questionsPerPage);
        const isCurrentPage = pageOfQuestion === currentPage;

        return (
          <button
            key={q.id}
            onClick={() => setCurrentPage(pageOfQuestion)}
            className={`w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center border-2 transition-all 
              ${isAnswered ? 'bg-accent border-accent text-white' : 'bg-bg border-muted/40 text-muted hover:border-muted'}
              ${isCurrentPage ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg scale-110' : ''}
            `}
          >
            {q.id}
          </button>
        );
      })}
    </div>
  );
}
