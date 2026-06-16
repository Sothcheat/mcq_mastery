import React, { useState, useRef } from 'react';
import { useStore } from '../store';
import { extractQuestionsFromPDF } from '../lib/gemini';
import { UploadCloud, Loader2 } from 'lucide-react';

export function UploadView() {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setQuestions = useStore(state => state.setQuestions);
  const setExamStatus = useStore(state => state.setExamStatus);

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const questions = await extractQuestionsFromPDF(base64Data);
          setQuestions(questions);
          setExamStatus('setup');
        } catch (err: any) {
          const errMsg = err?.message || "";
          if (errMsg.includes("503") || errMsg.toLowerCase().includes("high demand")) {
            setError("Gemini is currently experiencing high demand. Please wait a couple of minutes and try again!");
          } else if (errMsg.includes("403") || errMsg.toLowerCase().includes("leaked")) {
            setError("Your Gemini API key was disabled by Google because it was leaked. Please generate a new API key and update your environment variables.");
          } else {
            setError(errMsg || "Could not extract questions. Please check your PDF and try again.");
          }
          setIsLoading(false);
        }
      };
      reader.onerror = () => {
        setError("Error reading file.");
        setIsLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      const errMsg = err?.message || "";
      if (errMsg.includes("503") || errMsg.toLowerCase().includes("high demand")) {
        setError("Gemini is currently experiencing high demand. Please wait a couple of minutes and try again!");
      } else if (errMsg.includes("403") || errMsg.toLowerCase().includes("leaked")) {
        setError("Your Gemini API key was disabled by Google because it was leaked. Please generate a new API key and update your environment variables.");
      } else {
        setError("Could not extract questions. Please check your PDF and try again.");
      }
      setIsLoading(false);
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
              <p className="text-sm font-medium">Extracting questions from PDF...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 bg-accent/10 rounded-full text-accent">
                <UploadCloud className="w-8 h-8" />
              </div>
              <p className="text-sm font-medium">Drag & drop your PDF here, or click to browse</p>
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
