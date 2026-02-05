"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchBarProps {
  /**
   * Valor inicial da busca
   */
  value?: string;

  /**
   * Callback chamado quando busca muda (com debounce)
   */
  onSearch: (value: string) => void;

  /**
   * Placeholder do input
   */
  placeholder?: string;

  /**
   * Tempo de debounce em ms (default: 300)
   */
  debounce?: number;

  /**
   * Classe CSS adicional
   */
  className?: string;

  /**
   * Se true, mostra botão de limpar quando há texto
   */
  clearable?: boolean;
}

/**
 * Barra de busca com debounce automático
 *
 * @example
 * ```tsx
 * <SearchBar
 *   placeholder="Buscar clientes..."
 *   onSearch={(value) => setSearch(value)}
 *   debounce={500}
 *   clearable
 * />
 * ```
 */
export function SearchBar({
  value: initialValue = "",
  onSearch,
  placeholder = "Buscar...",
  debounce = 300,
  className = "",
  clearable = true,
}: SearchBarProps) {
  const [inputValue, setInputValue] = useState(initialValue);

  // Atualiza inputValue quando prop value muda
  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  // Debounce effect
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
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

      <Input
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className="pl-9 pr-9"
      />

      {clearable && inputValue && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
          onClick={handleClear}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Limpar busca</span>
        </Button>
      )}
    </div>
  );
}
