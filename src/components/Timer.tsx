import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Timer() {
  const timerRemainingSeconds = useStore(state => state.timerRemainingSeconds);
  const setTimerRemaining = useStore(state => state.setTimerRemaining);
  const setExamStatus = useStore(state => state.setExamStatus);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused || timerRemainingSeconds <= 0) return;

    const interval = setInterval(() => {
      setTimerRemaining(timerRemainingSeconds - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timerRemainingSeconds, isPaused, setTimerRemaining]);

  useEffect(() => {
    if (timerRemainingSeconds <= 0) {
      setExamStatus('results');
    }
  }, [timerRemainingSeconds, setExamStatus]);

  const minutes = Math.floor(timerRemainingSeconds / 60).toString().padStart(2, '0');
  const seconds = (timerRemainingSeconds % 60).toString().padStart(2, '0');

  return (
    <div className="flex items-center space-x-3 bg-surface border border-muted/20 px-4 py-2 rounded-full shadow-sm">
      <div className="font-mono text-xl font-semibold tracking-wider text-text">
        {minutes}:{seconds}
      </div>
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={() => setIsPaused(!isPaused)}
        className="h-8 w-8 text-muted hover:text-accent focus-visible:ring-accent"
      >
        {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </Button>
    </div>
  );
}
