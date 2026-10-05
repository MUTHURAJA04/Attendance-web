"use client";

import { useState, useRef, useEffect } from "react";

export interface MultiSelectOption {
  id: string;
  label: string;
  subLabel?: string;
}

interface MultiSelectDropdownProps {
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  options: MultiSelectOption[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  disabled?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function MultiSelectDropdown({
  label,
  placeholder = "Select options...",
  searchPlaceholder = "Search...",
  options,
  selectedIds,
  onChange,
  disabled = false,
  emptyMessage = "No options available",
  className = "",
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicked outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Measure space and focus search on open
  useEffect(() => {
    if (isOpen) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        // Only flip upward if space below is tight AND there is plenty of room above (>300px)
        if (spaceBelow < 240 && rect.top > 300) {
          setOpenUpward(true);
        } else {
          setOpenUpward(false);
        }
      }

      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearch("");
      setOpenUpward(false);
    }
  }, [isOpen]);

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const handleRemoveChip = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onChange(selectedIds.filter((item) => item !== id));
  };

  const selectedOptions = options.filter((opt) => selectedIds.includes(opt.id));
  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      (opt.subLabel && opt.subLabel.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div
      className={`form-group relative ${className}`}
      ref={containerRef}
      style={{ zIndex: isOpen ? 50 : undefined }}
    >
      {label && (
        <div className="flex justify-between items-center mb-1">
          <label className="label text-xs font-medium text-foreground">{label}</label>
          <span className="text-[0.68rem] text-muted-foreground font-mono">
            {selectedIds.length} selected
          </span>
        </div>
      )}

      {/* 1. Trigger Box */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`min-h-[40px] px-2.5 py-1.5 rounded-lg border bg-background flex flex-wrap items-center gap-1.5 transition-colors cursor-pointer select-none ${
          disabled
            ? "opacity-50 cursor-not-allowed bg-muted/40 border-input"
            : isOpen
            ? "border-ring ring-2 ring-ring/10"
            : "border-input hover:border-border"
        }`}
      >
        {selectedOptions.length === 0 ? (
          <span className="text-xs text-muted-foreground px-1 py-0.5">{placeholder}</span>
        ) : (
          selectedOptions.map((opt) => (
            <span
              key={opt.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-muted text-foreground border border-border/80 font-medium animate-in fade-in-50 duration-75"
            >
              <span>{opt.label}</span>
              <button
                type="button"
                onClick={(e) => handleRemoveChip(e, opt.id)}
                className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[0.65rem] text-muted-foreground hover:text-foreground hover:bg-muted-foreground/20 leading-none cursor-pointer transition-colors"
                title={`Remove ${opt.label}`}
              >
                ✕
              </button>
            </span>
          ))
        )}

        {/* Right chevron */}
        <span className="ml-auto pl-2 text-[0.7rem] text-muted-foreground shrink-0 pr-1">
          {isOpen ? "▲" : "▼"}
        </span>
      </div>

      {/* 2. Dropdown Menu */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute left-0 right-0 ${
            openUpward ? "bottom-full mb-1.5" : "top-full mt-1.5"
          } z-50 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in-50 duration-100`}
        >
          {/* Search Input */}
          <div className="p-2.5 border-b border-border bg-muted/30">
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground text-xs pointer-events-none">
                🔍
              </span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-8 pr-3 text-xs bg-background border border-input rounded-md focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/20 text-foreground"
              />
            </div>
          </div>

          {/* 3. Scrollable List (Dynamic generous height showing all items with smooth scroll) */}
          <div
            className="max-h-60 sm:max-h-72 overflow-y-auto p-1.5 divide-y divide-border/20 overscroll-contain touch-pan-y"
          >
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground italic">
                {search ? "No matches found" : emptyMessage}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedIds.includes(opt.id);
                return (
                  <div
                    key={opt.id}
                    onClick={() => handleToggle(opt.id)}
                    className={`flex items-center justify-between px-3 py-2.5 text-xs rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-secondary text-secondary-foreground font-semibold"
                        : "text-foreground hover:bg-muted/70"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span
                        className={`w-4 text-center font-bold text-xs shrink-0 ${
                          isSelected ? "text-primary" : "text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </div>
                    {opt.subLabel && (
                      <span className="text-[0.7rem] text-muted-foreground font-medium ml-2 shrink-0 bg-muted/60 px-1.5 py-0.5 rounded">
                        {opt.subLabel}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
