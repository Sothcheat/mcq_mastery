import React, { useEffect } from 'react';
import { useStore } from './store';
import { UploadView } from './components/UploadView';
import { ExamSetup } from './components/ExamSetup';
import { ExamView } from './components/ExamView';
import { ResultsView } from './components/ResultsView';
import { Timer } from './components/Timer';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function App() {
  const examStatus = useStore(state => state.examStatus);
  const isDarkMode = useStore(state => state.isDarkMode);
  const toggleDarkMode = useStore(state => state.toggleDarkMode);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <div className="min-h-screen transition-colors duration-200 selection:bg-accent/20">
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md border-b border-muted/20 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-accent">
          MCQ Mastery
        </h1>

        <div className="flex items-center space-x-4">
          {examStatus === 'exam' && <Timer />}
          <Button variant="ghost" size="icon" onClick={toggleDarkMode} className="text-muted hover:text-accent">
            {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-[800px]">
        {examStatus === 'upload' && <UploadView />}
        {examStatus === 'setup' && <ExamSetup />}
        {examStatus === 'exam' && <ExamView />}
        {examStatus === 'results' && <ResultsView />}
      </main>
    </div>
  );
}
