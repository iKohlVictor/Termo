export type CharStatus = 'correct' | 'present' | 'absent' | 'initial';

export interface LetterState {
  char: string;
  status: CharStatus;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export interface ToastMessage {
  text: string;
  id: number;
}