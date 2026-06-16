import { useStore } from '../store';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function ExamSetup() {
  const questions = useStore(state => state.questions);
  const durationMinutes = useStore(state => state.durationMinutes);
  const setDuration = useStore(state => state.setDuration);
  const setExamStatus = useStore(state => state.setExamStatus);
  const setTimerRemaining = useStore(state => state.setTimerRemaining);
  const resetExam = useStore(state => state.resetExam);

  const startExam = () => {
    resetExam();
    setTimerRemaining(durationMinutes * 60);
    setExamStatus('exam');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md w-full bg-surface p-8 rounded-2xl shadow-sm space-y-6 text-center border border-muted/20">
        <h2 className="text-2xl font-semibold">Exam Setup</h2>
        <p className="text-accent font-medium text-lg bg-accent/10 py-2 rounded-lg">
          {questions.length} questions extracted from PDF
        </p>

        <div className="space-y-3 text-left">
          <label className="text-sm font-medium text-text">Duration (minutes)</label>
          <Input
            type="number"
            min={1}
            value={durationMinutes}
            onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full text-lg bg-bg shadow-inner"
          />
        </div>

        <Button onClick={startExam} className="w-full py-6 text-lg bg-accent text-white hover:bg-accent/90">
          Start Exam
        </Button>
      </div>
    </div>
  );
}
