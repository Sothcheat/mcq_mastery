import React, { useState, useRef } from 'react';
import { useStore } from '../store';
import { extractTextFromPDF, extractQuestionsFromText, shuffleQuestions } from '../lib/exam-extractor';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { UploadCloud, Loader2, AlertTriangle } from 'lucide-react';

type Stage = 'idle' | 'reading' | 'parsing' | 'partial';

export function UploadView() {
  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [percent, setPercent] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [partialNote, setPartialNote] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setQuestions = useStore(state => state.setQuestions);
  const setExamStatus = useStore(state => state.setExamStatus);

  const isLoading = stage === 'reading' || stage === 'parsing';

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }

    setError('');
    setPartialNote('');

    try {
      // Stage 1 — extract raw text in the browser using unpdf
      setStage('reading');
      setPercent(0);
      setStatusText('Reading PDF…');
      const text = await extractTextFromPDF(file);

      // Stage 2 — chunk + extract questions (fast-path + AI), progress per chunk
      setStage('parsing');
      setPercent(0);
      setStatusText('Extracting questions…');
      const { questions, failedChunks } = await extractQuestionsFromText(text, ({ completed, total}) => {
        setPercent(total > 0 ? Math.round((completed / total) * 100) : 100);
        setStatusText(
          total > 0
            ? `Extracting questions… ${completed}/${total} sections`
            : 'Extracting questions…',
        );
      });

      const shuffled = shuffleQuestions(questions);
      setQuestions(shuffled);

      if (failedChunks > 0) {
        // Surface a non-blocking warning and let the user choose to continue.
        setPartialNote(
          `Extracted ${shuffled.length} questions, but ${failedChunks} section${failedChunks > 1 ? 's' : ''} could not be read and were skipped.`,
        );
        setStage('partial');
      } else {
        setExamStatus('setup');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || 'Could not extract questions. Please check your PDF and try again.');
      setStage('idle');
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Partial-success screen: questions are already loaded, user confirms to start.
  if (stage === 'partial') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex flex-col items-center space-y-4 bg-surface p-8 rounded-xl border border-muted/20 shadow-sm">
            <div className="p-4 bg-accent/10 rounded-full text-accent">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <p className="text-sm font-medium">{partialNote}</p>
            <Button onClick={() => setExamStatus('setup')} className="bg-accent text-white hover:bg-accent/90">
              Continue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h2 className="text-2xl font-semibold">Upload PDF</h2>
        <p className="text-muted text-sm">Upload your exam document to extract multiple-choice questions automatically.</p>

        <div
          onClick={() => !isLoading && fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors ${isDragging ? 'border-accent bg-accent/10' : 'border-muted/30 bg-surface hover:border-accent hover:bg-surface/80'
            } ${isLoading ? 'opacity-90 pointer-events-none' : ''}`}
        >
          {isLoading ? (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <p className="text-sm font-medium">{statusText}</p>
              <div className="w-full max-w-xs space-y-1">
                <Progress value={percent} />
                <p className="text-xs text-muted">{percent}%</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 bg-accent/10 rounded-full text-accent">
                <UploadCloud className="w-8 h-8" />
              </div>
              <p className="text-sm font-medium">Drag &amp; drop your PDF here, or click to browse</p>
            </div>
          )}
          <input
            type="file"
            accept=".pdf"
            className="hidden"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files?.[0]) handleFile(e.target.files[0]);
            }}
          />
        </div>

        {error && (
          <div className="text-wrong bg-wrong/10 p-3 rounded-md text-sm font-medium">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
