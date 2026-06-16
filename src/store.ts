import { create } from 'zustand';
import { Question } from './types';

interface ExamState {
  questions: Question[];
  durationMinutes: number;
  timerRemainingSeconds: number;
  answers: Record<number, string>;
  examStatus: 'upload' | 'setup' | 'exam' | 'results';
  isDarkMode: boolean;
  
  setQuestions: (questions: Question[]) => void;
  setDuration: (minutes: number) => void;
  setTimerRemaining: (seconds: number) => void;
  setAnswer: (questionId: number, answer: string) => void;
  setExamStatus: (status: 'upload' | 'setup' | 'exam' | 'results') => void;
  toggleDarkMode: () => void;
  resetExam: () => void;
  resetAll: () => void;
}

export const useStore = create<ExamState>((set) => ({
  questions: [],
  durationMinutes: 60,
  timerRemainingSeconds: 3600,
  answers: {},
  examStatus: 'upload',
  isDarkMode: localStorage.getItem('theme') === 'dark' || 
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches),
  
  setQuestions: (questions) => set({ questions }),
  setDuration: (minutes) => set({ durationMinutes: minutes }),
  setTimerRemaining: (seconds) => set({ timerRemainingSeconds: seconds }),
  setAnswer: (questionId, answer) => set((state) => ({ 
    answers: { ...state.answers, [questionId]: answer } 
  })),
  setExamStatus: (status) => set({ examStatus: status }),
  toggleDarkMode: () => set((state) => {
    const newMode = !state.isDarkMode;
    if (newMode) {
      localStorage.setItem('theme', 'dark');
    } else {
      localStorage.setItem('theme', 'light');
    }
    return { isDarkMode: newMode };
  }),
  resetExam: () => set((state) => ({
    answers: {},
    timerRemainingSeconds: state.durationMinutes * 60,
    examStatus: 'exam'
  })),
  resetAll: () => set({
    questions: [],
    durationMinutes: 60,
    timerRemainingSeconds: 3600,
    answers: {},
    examStatus: 'upload'
  })
}));
