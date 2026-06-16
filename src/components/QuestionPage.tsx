import React from 'react';
import { Question } from '../types';
import { useStore } from '../store';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface QuestionPageProps {
  questions: Question[];
}

export function QuestionPage({ questions }: QuestionPageProps) {
  const answers = useStore(state => state.answers);
  const setAnswer = useStore(state => state.setAnswer);

  return (
    <div className="space-y-10">
      {questions.map((q) => (
        <div key={q.id} className="bg-surface p-6 rounded-xl border border-muted/20 shadow-sm space-y-4">
          <h3 className="text-lg font-medium leading-relaxed">
            <span className="font-semibold text-accent mr-2">Q{q.id}.</span>
            {q.question}
          </h3>
          <RadioGroup 
            value={answers[q.id] || ""} 
            onValueChange={(val) => setAnswer(q.id, val)}
            className="space-y-3 pt-2"
          >
            {q.options.map((opt, i) => (
              <div 
                key={i} 
                className={`flex items-center space-x-3 border p-3 rounded-lg cursor-pointer transition-colors ${
                  answers[q.id] === opt ? 'border-accent bg-accent/5' : 'border-muted/30 hover:bg-muted/5'
                }`}
                onClick={() => setAnswer(q.id, opt)}
              >
                <RadioGroupItem value={opt} id={`q${q.id}-opt${i}`} className="border-muted text-accent" />
                <Label htmlFor={`q${q.id}-opt${i}`} className="flex-1 cursor-pointer text-base font-normal leading-snug">
                  {opt}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      ))}
    </div>
  );
}
