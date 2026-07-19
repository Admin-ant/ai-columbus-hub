import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pdokSuggest, pdokLookup, type PdokAddress, type PdokSuggestion } from "@/lib/pdok-address";

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (address: PdokAddress) => void;
  placeholder?: string;
  label?: string;
}) {
  const [suggestions, setSuggestions] = useState<PdokSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focused) return;
    const q = value.trim();
    if (q.length < 3) { setSuggestions([]); setOpen(false); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await pdokSuggest(q, ctrl.signal);
        setSuggestions(res);
        setOpen(res.length > 0);
      } catch {
        // ignore aborts
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [value, focused]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function pick(s: PdokSuggestion) {
    setOpen(false);
    const addr = await pdokLookup(s.id);
    if (addr) {
      if (addr.address_line1) onChange(addr.address_line1);
      else onChange(s.label);
      onSelect(addr);
    } else {
      onChange(s.label);
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      {label && <Label>{label}</Label>}
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder ?? "Bijv. Damrak 1, Amsterdam of 1012LG"}
          autoComplete="off"
        />
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
        </div>
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
