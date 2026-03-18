import React, { createContext, useContext, useState, ReactNode } from 'react';

interface FocusModeContextType {
  isFocusMode: boolean;
  setIsFocusMode: (value: boolean) => void;
}

const FocusModeContext = createContext<FocusModeContextType | undefined>(undefined);

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [isFocusMode, setIsFocusMode] = useState(false);

  return (
    <FocusModeContext.Provider value={{ isFocusMode, setIsFocusMode }}>
      {children}
    </FocusModeContext.Provider>
  );
}

export function useFocusMode() {
  const context = useContext(FocusModeContext);
  if (context === undefined) {
    throw new Error('useFocusMode must be used within a FocusModeProvider');
  }
  return context;
}
