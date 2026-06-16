import React, { useState, useRef } from 'react';
import { useStore } from '../store';
import { extractTextFromPDF, extractQuestionsFromText, shuffleQuestions } from '../lib/exam-extractor';
import { UploadCloud, Loader2 } from 'lucide-react';

type LoadingStage = 'idle' | 'extracting' | 'processing';

const STAGE_MESSAGES: Record<LoadingStage, string> = {
  idle: '',
  extracting: 'Reading PDF…',
  processing: 'Extracting questions with AI (this may take a minute)…',
};

export function UploadView() {
  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<LoadingStage>('idle');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setQuestions = useStore(state => state.setQuestions);
  const setExamStatus = useStore(state => state.setExamStatus);

  const isLoading = stage !== 'idle';

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }

    setError('');

    try {
      // Stage 1 – extract raw text in the browser using unpdf
      setStage('extracting');
      const text = await extractTextFromPDF(file);

      // Stage 2 – send text to backend for AI extraction
      setStage('processing');
      const questions = await extractQuestionsFromText(text);

      // Shuffle questions and their options before storing in state
      const shuffled = shuffleQuestions(questions);

      setQuestions(shuffled);
      setExamStatus('setup');
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
            } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {isLoading ? (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin text-accent" />
              <p className="text-sm font-medium">{STAGE_MESSAGES[stage]}</p>
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
