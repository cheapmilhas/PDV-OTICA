"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  value?: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  debounce?: number;
  className?: string;
  clearable?: boolean;
}

export function SearchBar({
  value: initialValue = "",
  onSearch,
  placeholder = "Buscar...",
  debounce = 300,
  className = "",
  clearable = true,
}: SearchBarProps) {
  const [inputValue, setInputValue] = useState(initialValue);

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(inputValue);
    }, debounce);

    return () => clearTimeout(timer);
  }, [inputValue, debounce, onSearch]);

  const handleClear = useCallback(() => {
    setInputValue("");
    onSearch("");
  }, [onSearch]);

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />

      <Input
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className="pl-9 pr-8"
      />

      {clearable && inputValue && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          onClick={handleClear}
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Limpar busca</span>
        </button>
      )}
    </div>
  );
}
