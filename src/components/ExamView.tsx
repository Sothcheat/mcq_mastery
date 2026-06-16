import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { QuestionPage } from './QuestionPage';
import { Navigator } from './Navigator';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ExamView() {
  const questions = useStore(state => state.questions);
  const answers = useStore(state => state.answers);
  const setExamStatus = useStore(state => state.setExamStatus);
  const [currentPage, setCurrentPage] = useState(0);

  const questionsPerPage = useMemo(() => {
    if (questions.length === 0) return 5;
    const avgLen = questions.reduce((acc, q) => acc + q.question.length, 0) / questions.length;
    return avgLen < 100 ? 5 : 4;
  }, [questions]);

  const totalPages = Math.ceil(questions.length / questionsPerPage);
  const currentQuestions = questions.slice(currentPage * questionsPerPage, (currentPage + 1) * questionsPerPage);
  const unansweredCount = questions.length - Object.keys(answers).length;

  const handleSubmit = () => {
    setExamStatus('results');
  };

  const submitDialogContent = (
    <AlertDialogContent className="bg-surface border-muted/20 text-text">
      <AlertDialogHeader>
        <AlertDialogTitle>Submit exam?</AlertDialogTitle>
        <AlertDialogDescription className="text-muted">
          {unansweredCount > 0 
            ? `You have ${unansweredCount} unanswered question${unansweredCount === 1 ? '' : 's'}. Are you sure you want to submit?`
            : `You have answered all questions. Ready to submit?`}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel className="border-muted/30 hover:bg-muted/10">Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={handleSubmit} className="bg-accent text-white hover:bg-accent/90">
          Confirm Submit
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );

  return (
    <div className="max-w-3xl mx-auto pb-28 space-y-6">
      <Navigator 
        totalPages={totalPages} 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        questionsPerPage={questionsPerPage} 
      />
      
      <div className="flex justify-between items-center text-sm font-medium text-muted mb-4 px-2">
        <span>Page {currentPage + 1} of {totalPages}</span>
        <span>{Object.keys(answers).length} / {questions.length} answered</span>
      </div>

      <QuestionPage questions={currentQuestions} />

      <div className="flex justify-between items-center pt-8 px-2">
        <Button 
          variant="outline" 
          onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
          disabled={currentPage === 0}
          className="border-muted/30 hover:bg-muted/5"
        >
          <ChevronLeft className="w-4 h-4 mr-2" /> Previous
        </Button>
        {currentPage === totalPages - 1 ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="bg-accent text-white hover:bg-accent/90">Submit Exam</Button>
            </AlertDialogTrigger>
            {submitDialogContent}
          </AlertDialog>
        ) : (
          <Button 
            variant="outline" 
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            className="border-muted/30 hover:bg-muted/5"
          >
            Next <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-bg/80 backdrop-blur-md border-t border-muted/20 p-4 flex justify-center z-50">
        <div className="max-w-[800px] w-full flex justify-end px-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="bg-accent text-white hover:bg-accent/90 px-8 shadow-sm">Submit Exam</Button>
            </AlertDialogTrigger>
            {submitDialogContent}
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
