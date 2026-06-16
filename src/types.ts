export type Question = {
  id: number;
  question: string;
  options: string[];   // exactly 4 options
  answer: string;      // must exactly match one of the options strings
}
