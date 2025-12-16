import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { WORDS, WORD_LENGTH, MAX_CHALLENGES, VALID_GUESSES } from './constants';
import { CharStatus, GameStatus, LetterState, ToastMessage } from './types';

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
];

// --- Helper Components ---

// Displays a pop-up message
const Toast = ({ message }: { message: string }) => (
  <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-white text-black px-4 py-2 rounded font-bold shadow-lg z-50 transition-opacity duration-300 pointer-events-none text-center whitespace-nowrap">
    {message}
  </div>
);

interface TileProps {
  letter: string;
  status: CharStatus;
  isCompleted: boolean;
  revealDelay: number;
  sizeClass: string;
  isActive?: boolean;
  onClick?: () => void;
}

// Individual Grid Tile
const Tile: React.FC<TileProps> = ({ 
  letter, 
  status, 
  isCompleted, 
  revealDelay,
  sizeClass,
  isActive = false,
  onClick
}) => {
  // Styles based on status
  let baseStyle = `${sizeClass} flex items-center justify-center font-bold uppercase select-none transition-all duration-200 cursor-pointer`;
  
  // Active cursor style override
  if (isActive) {
    baseStyle += " active-cursor border-b-4 border-[#4c4c4e]";
  } else {
    baseStyle += " border-2";
  }

  let colors = "";
  let border = "";
  
  // Status logic for colors
  if (status === 'initial') {
    colors = "bg-transparent text-white";
    // If active, border is handled by active-cursor class logic above (mostly)
    if (!isActive) {
      border = letter ? "border-[#565758]" : "border-[#3a3a3c]";
    } else {
       // active tile base border color when not blinking
       border = "border-[#4c4c4e]"; 
    }
  } else if (status === 'correct') {
    colors = "bg-[#538d4e] text-white"; // Green
    border = "border-[#538d4e]";
  } else if (status === 'present') {
    colors = "bg-[#b59f3b] text-white"; // Yellow
    border = "border-[#b59f3b]";
  } else if (status === 'absent') {
    colors = "bg-[#3a3a3c] text-white"; // Dark Gray
    border = "border-[#3a3a3c]";
  }

  // Animation delay style
  const animationStyle = isCompleted ? { animationDelay: `${revealDelay}ms` } : {};
  const animationClass = isCompleted ? "animate-flip" : (letter && status === 'initial' && !isActive ? "animate-pop" : "");

  return (
    <div 
      className={`${baseStyle} ${colors} ${border} ${animationClass}`} 
      style={animationStyle}
      onClick={onClick}
    >
      {letter}
    </div>
  );
};

// --- Main App ---

export default function App() {
  // Game Configuration State
  const [level, setLevel] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [hintCost, setHintCost] = useState<number>(5);
  
  // Game Data State
  const [solutions, setSolutions] = useState<string[]>([]);
  const [guesses, setGuesses] = useState<string[]>([]);
  
  // Current Guess is now an array of chars to allow random access editing
  const [currentGuess, setCurrentGuess] = useState<string[]>(Array(WORD_LENGTH).fill(""));
  const [activeTileIndex, setActiveTileIndex] = useState<number>(0);
  
  const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
  
  // Which specific board indices are solved?
  const [solvedIndices, setSolvedIndices] = useState<boolean[]>([]);
  
  // Hints Persistence State
  const [revealedHints, setRevealedHints] = useState<Record<number, string>>({});
  const [hintedSolutionIndex, setHintedSolutionIndex] = useState<number | null>(null);

  // UX State
  const [shakeRow, setShakeRow] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  
  // Dictionary State - initialize with filtered fallback list to guarantee no 4-letter words
  const [validGuessesSet, setValidGuessesSet] = useState<Set<string>>(() => {
     const filtered = VALID_GUESSES.filter(w => w.length === WORD_LENGTH && !w.includes(" "));
     return new Set(filtered);
  });
  const [isDictionaryLoaded, setIsDictionaryLoaded] = useState(false);

  // Derived settings based on level
  const numWords = level + 1;
  const maxChallenges = 6 + level;

  // Initialize game based on current level
  const initGame = useCallback(() => {
    // Select N distinct random words
    // Strict filtering for solutions to prevent selecting unplayable 4-letter words
    const validWords = WORDS.filter(w => w.length === WORD_LENGTH && !w.includes(" "));
    
    const newSolutions: string[] = [];
    while (newSolutions.length < numWords) {
      const randomWord = validWords[Math.floor(Math.random() * validWords.length)];
      if (!newSolutions.includes(randomWord)) {
        newSolutions.push(randomWord);
      }
    }

    setSolutions(newSolutions);
    setSolvedIndices(new Array(numWords).fill(false));
    setGuesses([]);
    setCurrentGuess(Array(WORD_LENGTH).fill(""));
    setActiveTileIndex(0);
    setGameStatus('playing');
    setShakeRow(false);
    setHintCost(5); // Reset hint cost on new level
    setRevealedHints({});
    setHintedSolutionIndex(null);
    setToast(null);
    console.log(`Fase ${level} - Soluções:`, newSolutions);
  }, [level, numWords]);

  // Initial load
  useEffect(() => {
    initGame();
  }, [initGame]);

  // Reset score when restarting from level 0
  useEffect(() => {
    if (level === 0) {
      setScore(0);
    }
  }, [level]);

  // Load external dictionary
  useEffect(() => {
    const fetchDictionary = async () => {
      try {
        const response = await fetch('https://raw.githubusercontent.com/fserb/pt-br/master/palavras');
        if (!response.ok) throw new Error('Network response was not ok');
        
        const text = await response.text();
        const rawWords = text.split('\n');
        
        const processedWords = rawWords
          .map(w => w.trim())
          .map(w => w.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase())
          // Strict filtering: Only 5 letter words, no spaces/special chars
          .filter(w => w.length === WORD_LENGTH && /^[A-Z]+$/.test(w));

        setValidGuessesSet(prev => {
          const newSet = new Set(prev);
          processedWords.forEach(w => newSet.add(w));
          return newSet;
        });
        setIsDictionaryLoaded(true);
      } catch (error) {
        console.warn("Falha ao carregar dicionário online, usando lista local.", error);
      }
    };

    fetchDictionary();
  }, []);

  const showToast = (text: string) => {
    setToast({ text, id: Date.now() });
    setTimeout(() => setToast(null), 2500);
  };

  // Logic to calculate colors for a specific word/solution
  const getGuessStatuses = (guess: string, solutionWord: string): CharStatus[] => {
    const splitSolution = solutionWord.split('');
    const splitGuess = guess.split('');
    const statuses: CharStatus[] = Array(WORD_LENGTH).fill('absent');
    const solutionCharsTaken = splitSolution.map(() => false);

    // Pass 1: Green
    splitGuess.forEach((letter, i) => {
      if (letter === splitSolution[i]) {
        statuses[i] = 'correct';
        solutionCharsTaken[i] = true;
      }
    });

    // Pass 2: Yellow
    splitGuess.forEach((letter, i) => {
      if (statuses[i] !== 'correct') {
        const indexOfCharInSolution = splitSolution.findIndex(
          (sLetter, index) => sLetter === letter && !solutionCharsTaken[index]
        );

        if (indexOfCharInSolution > -1) {
          statuses[i] = 'present';
          solutionCharsTaken[indexOfCharInSolution] = true;
        }
      }
    });

    return statuses;
  };

  const getKeyStatuses = () => {
    const keyStatuses: { [key: string]: CharStatus } = {};

    guesses.forEach((guess) => {
      solutions.forEach((sol, solIndex) => {
        if (solvedIndices[solIndex]) return;

        const statuses = getGuessStatuses(guess, sol);
        guess.split('').forEach((letter, i) => {
          const currentStatus = keyStatuses[letter];
          const newStatus = statuses[i];

          // Priority: Correct > Present > Absent
          if (currentStatus === 'correct') return;
          if (newStatus === 'correct') {
            keyStatuses[letter] = 'correct';
            return;
          }
          if (currentStatus === 'present') return;
          if (newStatus === 'present') {
            keyStatuses[letter] = 'present';
            return;
          }
          if (newStatus === 'absent') {
            keyStatuses[letter] = 'absent';
          }
        });
      });
    });
    return keyStatuses;
  };

  const handleHint = useCallback(() => {
    if (gameStatus !== 'playing') return;

    if (score < hintCost) {
      showToast(`Pontos insuficientes! (${hintCost} pts)`);
      return;
    }

    // Identify the first unsolved board to give a hint for
    const currentUnsolvedIndex = solvedIndices.findIndex(solved => !solved);
    
    // Should generally not happen if game is playing
    if (currentUnsolvedIndex === -1) return; 

    // Manage hint targeting logic
    // If we were hinted on a different word, or first time, reset/set target
    let activeHintIndex = hintedSolutionIndex;
    if (activeHintIndex === null || solvedIndices[activeHintIndex] || activeHintIndex !== currentUnsolvedIndex) {
        activeHintIndex = currentUnsolvedIndex;
        setHintedSolutionIndex(activeHintIndex);
        setRevealedHints({}); // clear hints if switching targets
    }

    const targetSolution = solutions[activeHintIndex];

    // Find indices in the current guess that are currently empty AND not already revealed by a hint
    const availableIndices = currentGuess
      .map((char, index) => ({ char, index }))
      .filter(({ char, index }) => char === "" && !revealedHints[index])
      .map(({ index }) => index);

    if (availableIndices.length === 0) {
      showToast("Libere espaço (não revelado) para a dica!");
      setShakeRow(true);
      setTimeout(() => setShakeRow(false), 500);
      return;
    }

    // Pick a random empty slot
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    const correctLetter = targetSolution[randomIndex];

    // Persist the hint
    const newRevealed = { ...revealedHints, [randomIndex]: correctLetter };
    setRevealedHints(newRevealed);

    // Update the guess immediately
    setCurrentGuess(prev => {
      const newGuess = [...prev];
      newGuess[randomIndex] = correctLetter;
      return newGuess;
    });

    // Deduct score and increase cost
    setScore(prev => prev - hintCost);
    setHintCost(prev => prev + 5);
    
    // Move cursor to next available if we filled the current active one
    if (randomIndex === activeTileIndex) {
      let nextIndex = activeTileIndex;
      while (nextIndex < WORD_LENGTH - 1 && currentGuess[nextIndex] !== "") {
        nextIndex++;
      }
      setActiveTileIndex(nextIndex);
    }
  }, [gameStatus, score, hintCost, solvedIndices, solutions, currentGuess, activeTileIndex, revealedHints, hintedSolutionIndex]);

  const onKeyDown = useCallback((key: string) => {
    if (gameStatus !== 'playing') return;

    if (key === 'BACKSPACE') {
      setCurrentGuess((prev) => {
        const newGuess = [...prev];
        // If current tile has a letter, delete it
        if (newGuess[activeTileIndex] !== "") {
          newGuess[activeTileIndex] = "";
          return newGuess;
        } else {
          // If empty, move back and delete that one
          const prevIndex = Math.max(0, activeTileIndex - 1);
          newGuess[prevIndex] = "";
          setActiveTileIndex(prevIndex);
          return newGuess;
        }
      });
      return;
    }

    if (key === 'ARROWLEFT') {
      setActiveTileIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key === 'ARROWRIGHT') {
      setActiveTileIndex(prev => Math.min(WORD_LENGTH - 1, prev + 1));
      return;
    }

    if (key === 'ENTER') {
      const joinedGuess = currentGuess.join("");
      
      // Explicitly check for empty slots or wrong length
      if (joinedGuess.length !== WORD_LENGTH || currentGuess.includes("")) {
        setShakeRow(true);
        showToast("Palavra incompleta");
        setTimeout(() => setShakeRow(false), 500);
        return;
      }

      if (!validGuessesSet.has(joinedGuess)) {
        setShakeRow(true);
        showToast("Palavra desconhecida");
        setTimeout(() => setShakeRow(false), 500);
        return;
      }

      const newGuesses = [...guesses, joinedGuess];
      setGuesses(newGuesses);

      // Check which boards are solved by this new guess
      const newSolvedIndices = [...solvedIndices];
      let turnPoints = 0;

      solutions.forEach((sol, i) => {
        if (!newSolvedIndices[i] && joinedGuess === sol) {
          newSolvedIndices[i] = true;
          // Score Calculation:
          const attemptsTaken = guesses.length; // 0 for 1st attempt
          const pointsEarned = Math.max(10, 100 - (attemptsTaken * 15));
          turnPoints += pointsEarned;
          setScore(prev => prev + pointsEarned);
        }
      });
      setSolvedIndices(newSolvedIndices);

      // --- Hint Persistence Logic ---
      // Check if the word we were hinting is now solved
      const wasHintedWordSolved = hintedSolutionIndex !== null && newSolvedIndices[hintedSolutionIndex];
      
      if (wasHintedWordSolved) {
         // If solved, clear hints
         setRevealedHints({});
         setHintedSolutionIndex(null);
         setCurrentGuess(Array(WORD_LENGTH).fill(""));
      } else {
         // If not solved, pre-fill the next guess with revealed hints
         const nextGuess = Array(WORD_LENGTH).fill("");
         Object.entries(revealedHints).forEach(([idx, char]) => {
            nextGuess[Number(idx)] = char;
         });
         setCurrentGuess(nextGuess);
      }
      
      setActiveTileIndex(0); // Reset cursor to start

      // Check Win/Loss
      const allSolved = newSolvedIndices.every(Boolean);
      if (allSolved) {
        setGameStatus('won');
        showToast(turnPoints > 0 ? `+${turnPoints} pts • Fase Completa!` : "Fase Completa!");
      } else if (newGuesses.length >= maxChallenges) {
        setGameStatus('lost');
        showToast("Fim de Jogo!");
      } else if (turnPoints > 0) {
        showToast(`+${turnPoints} PONTOS!`);
      }
      return;
    }

    // Handle character input
    if (/^[A-Z]$/.test(key) && key.length === 1) {
      setCurrentGuess((prev) => {
        const newGuess = [...prev];
        newGuess[activeTileIndex] = key;
        return newGuess;
      });
      // Auto-advance cursor if not at the end
      if (activeTileIndex < WORD_LENGTH - 1) {
        setActiveTileIndex(prev => prev + 1);
      }
    }
  }, [currentGuess, activeTileIndex, gameStatus, guesses, solutions, solvedIndices, validGuessesSet, maxChallenges, revealedHints, hintedSolutionIndex]);

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toUpperCase();
      if (key === 'ENTER' || key === 'BACKSPACE' || key === 'ARROWLEFT' || key === 'ARROWRIGHT') {
        onKeyDown(key);
      } else if (/^[A-Z]$/.test(key) && key.length === 1) {
        onKeyDown(key);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onKeyDown]);

  const keyStatuses = getKeyStatuses();

  // Dynamic sizing based on number of grids
  const getTileSizeClass = () => {
    if (level === 0) return "w-14 h-14 text-3xl"; 
    if (level === 1) return "w-10 h-10 text-xl";  
    if (level >= 2) return "w-8 h-8 text-lg";     
    return "w-14 h-14";
  };
  const tileSize = getTileSizeClass();

  return (
    <div className="flex flex-col items-center justify-between min-h-screen w-full p-2 font-sans overflow-hidden">
      
      {/* Header */}
      <header className="border-b border-[#3a3a3c] w-full flex justify-between items-center py-2 mb-2 px-4 max-w-4xl">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold tracking-wider">TERMO</h1>
          <span className="text-xs text-gray-400">FASE {level} • {numWords} {numWords > 1 ? 'PALAVRAS' : 'PALAVRA'}</span>
        </div>
        
        <div className="flex flex-col items-end">
          <div className="text-xl font-bold text-[#538d4e]">
             {score} <span className="text-xs text-gray-400 font-normal">PTS</span>
          </div>
          {isDictionaryLoaded && (
             <span className="text-[10px] text-green-500 font-mono opacity-60" title="Dicionário online">
               ONLINE
             </span>
          )}
        </div>
      </header>

      {/* Toast */}
      {toast && <Toast message={toast.text} />}

      {/* Game Area */}
      <div className="flex-grow flex items-start justify-center overflow-y-auto w-full mb-2">
        <div className="flex flex-wrap justify-center gap-4 p-2">
          
          {solutions.map((sol, solIndex) => {
            const isBoardSolved = solvedIndices[solIndex];

            return (
              <div key={solIndex} className="flex flex-col gap-1">
                {/* Render Guesses */}
                {Array.from({ length: maxChallenges }).map((_, rowIndex) => {
                  const guess = guesses[rowIndex];
                  if (guess) {
                    const solvedAtTurn = guesses.findIndex(g => g === sol);
                    const shouldRenderTiles = !isBoardSolved || (solvedAtTurn >= rowIndex);

                    if (shouldRenderTiles) {
                      const statuses = getGuessStatuses(guess, sol);
                      return (
                        <div key={rowIndex} className="flex gap-1">
                          {guess.split('').map((letter, j) => (
                            <Tile 
                              key={j} 
                              letter={letter} 
                              status={statuses[j]} 
                              isCompleted={true}
                              revealDelay={j * 150} 
                              sizeClass={tileSize}
                            />
                          ))}
                        </div>
                      );
                    } else {
                      return (
                        <div key={rowIndex} className="flex gap-1 opacity-20">
                           {Array.from({ length: WORD_LENGTH }).map((_, j) => (
                              <Tile key={j} letter="" status="initial" isCompleted={false} revealDelay={0} sizeClass={tileSize} />
                           ))}
                        </div>
                      );
                    }
                  }

                  // Render Current Input Row
                  if (rowIndex === guesses.length) {
                     if (isBoardSolved) {
                        return (
                          <div key={rowIndex} className="flex gap-1 opacity-10">
                             {Array.from({ length: WORD_LENGTH }).map((_, j) => (
                                <Tile key={j} letter="" status="initial" isCompleted={false} revealDelay={0} sizeClass={tileSize} />
                             ))}
                          </div>
                        );
                     }
                     return (
                      <div key={rowIndex} className={`flex gap-1 ${shakeRow ? 'animate-shake' : ''}`}>
                        {Array.from({ length: WORD_LENGTH }).map((_, i) => (
                          <Tile 
                            key={i} 
                            letter={currentGuess[i]} 
                            status="initial" 
                            isCompleted={false} 
                            revealDelay={0}
                            sizeClass={tileSize}
                            isActive={i === activeTileIndex}
                            onClick={() => setActiveTileIndex(i)}
                          />
                        ))}
                      </div>
                     );
                  }

                  // Empty Rows
                  return (
                    <div key={rowIndex} className="flex gap-1">
                      {Array.from({ length: WORD_LENGTH }).map((_, j) => (
                        <Tile key={j} letter="" status="initial" isCompleted={false} revealDelay={0} sizeClass={tileSize} />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Keyboard & Hint Controls */}
      <div className="w-full max-w-lg mb-2 px-1 flex flex-col items-center">
        
        {/* Helper Toolbar */}
        {gameStatus === 'playing' && (
          <div className="flex w-full justify-end px-1 mb-2">
             <button
              onClick={handleHint}
              disabled={score < hintCost}
              className={`flex items-center gap-1 text-xs font-bold py-1 px-3 rounded-full border transition-colors ${
                 score >= hintCost 
                 ? "bg-yellow-600/20 border-yellow-600 text-yellow-500 hover:bg-yellow-600 hover:text-white" 
                 : "bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed"
              }`}
             >
               <span>💡 DICA</span>
               <span className="bg-black/30 px-1 rounded text-[10px]">{hintCost} pts</span>
             </button>
          </div>
        )}

        {KEYBOARD_ROWS.map((row, i) => (
          <div key={i} className="flex justify-center gap-1 mb-1.5 w-full">
            {row.map((key) => {
              const status = keyStatuses[key] || 'initial';
              let bgColor = "bg-[#818384]";
              if (status === 'correct') bgColor = "bg-[#538d4e]";
              if (status === 'present') bgColor = "bg-[#b59f3b]";
              if (status === 'absent') bgColor = "bg-[#3a3a3c]";

              return (
                <button
                  key={key}
                  onClick={() => onKeyDown(key)}
                  className={`${bgColor} text-white font-bold py-3 rounded text-[10px] sm:text-xs flex-1 transition-colors`}
                >
                  {key}
                </button>
              );
            })}
            {i === 2 && (
              <button
                onClick={() => onKeyDown('BACKSPACE')}
                className="bg-[#818384] text-white font-bold py-3 px-2 rounded text-[10px] sm:text-xs flex-1 max-w-[50px]"
              >
                ⌫
              </button>
            )}
            {i === 2 && (
              <button
                onClick={() => onKeyDown('ENTER')}
                className="bg-[#818384] text-white font-bold py-3 px-2 rounded text-[10px] sm:text-xs flex-1 max-w-[50px] ml-1"
              >
                ENT
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Game Over / Next Level Controls */}
      {gameStatus !== 'playing' && (
        <div className="flex flex-col gap-2 mb-4 w-full max-w-xs z-50">
          {gameStatus === 'won' ? (
            <button 
              onClick={() => setLevel(prev => prev + 1)}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded shadow-lg w-full"
            >
              Próxima Fase &rarr;
            </button>
          ) : (
            <div className="flex flex-col gap-2 w-full">
              <div className="bg-[#3a3a3c] p-2 rounded text-center text-sm mb-2">
                Soluções: {solutions.join(", ")}
              </div>
              <button 
                onClick={initGame} 
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded shadow-lg w-full"
              >
                Tentar Novamente
              </button>
               <button 
                onClick={() => setLevel(0)} 
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-8 rounded shadow-lg w-full text-sm"
              >
                Reiniciar do Zero
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}