"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Package, User, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ProductResult {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  salePrice: number;
  stockQty: number;
  type: string;
}

interface CustomerResult {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
}

interface SearchResults {
  products: ProductResult[];
  customers: CustomerResult[];
}

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const allItems = results
    ? [
        ...results.products.map((p) => ({ type: "product" as const, data: p })),
        ...results.customers.map((c) => ({ type: "customer" as const, data: c })),
      ]
    : [];

  const doSearch = useCallback(async (term: string) => {
    if (term.length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      if (!res.ok) throw new Error();
      const data: SearchResults = await res.json();
      setResults(data);
      setOpen(true);
      setActiveIndex(-1);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const navigateTo = useCallback(
    (path: string) => {
      setOpen(false);
      setQuery("");
      setResults(null);
      router.push(path);
    },
    [router]
  );

  const handleSelect = useCallback(
    (item: (typeof allItems)[number]) => {
      if (item.type === "product") {
        navigateTo(`/dashboard/produtos/${item.data.id}`);
      } else {
        navigateTo(`/dashboard/clientes/${item.data.id}`);
      }
    },
    [navigateTo]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || allItems.length === 0) {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev < allItems.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : allItems.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < allItems.length) {
          handleSelect(allItems[activeIndex]);
        }
        break;
      case "Escape":
        setOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  // Fechar ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Cleanup debounce
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatCpf = (cpf: string) =>
    cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

  const hasResults = results && (results.products.length > 0 || results.customers.length > 0);
  const noResults = results && results.products.length === 0 && results.customers.length === 0;

  let flatIndex = -1;

  return (
    <div ref={containerRef} className="relative w-full">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground animate-spin" />
      )}
      <Input
        ref={inputRef}
        type="search"
        placeholder="Buscar produtos, clientes..."
        className="pl-10 pr-10"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (results && query.length >= 2) setOpen(true);
        }}
      />

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-[400px] overflow-y-auto">
          {loading && !results && (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Buscando...
            </div>
          )}

          {noResults && (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Nenhum resultado para &quot;{query}&quot;
            </div>
          )}

          {hasResults && (
            <>
              {results.products.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
                    Produtos
                  </div>
                  {results.products.map((product) => {
                    flatIndex++;
                    const idx = flatIndex;
                    return (
                      <button
                        key={product.id}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors ${
                          activeIndex === idx ? "bg-accent" : ""
                        }`}
                        onClick={() => handleSelect({ type: "product", data: product })}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <Package className="h-4 w-4 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            SKU: {product.sku}
                            {product.barcode ? ` · Cód: ${product.barcode}` : ""}
                            {" · Estoque: "}{product.stockQty}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-green-600 shrink-0">
                          {formatCurrency(Number(product.salePrice))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {results.customers.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
                    Clientes
                  </div>
                  {results.customers.map((customer) => {
                    flatIndex++;
                    const idx = flatIndex;
                    return (
                      <button
                        key={customer.id}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors ${
                          activeIndex === idx ? "bg-accent" : ""
                        }`}
                        onClick={() => handleSelect({ type: "customer", data: customer })}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <User className="h-4 w-4 text-orange-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{customer.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {customer.cpf ? `CPF: ${formatCpf(customer.cpf)}` : ""}
                            {customer.cpf && customer.phone ? " · " : ""}
                            {customer.phone ? `Tel: ${customer.phone}` : ""}
                            {!customer.cpf && !customer.phone && customer.email
                              ? customer.email
                              : ""}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
