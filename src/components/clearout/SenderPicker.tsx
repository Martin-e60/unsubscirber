"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { useApi } from "@/lib/api/context";
import type { SenderSuggestionDto } from "@/lib/api/types";
import { isSenderAddress, MAX_SENDERS } from "@/lib/clearout/filters";
import styles from "./Pickers.module.css";

/**
 * Choosing senders. Search by name or address; the suggestions come from
 * everyone a scan already knows and from who actually sent matching mail,
 * so it is not limited to mailing lists. An exact address can always be
 * used as typed. Each suggestion shows its address, so two "Alex"es are
 * told apart. Several senders match any of them.
 */
export function SenderPicker({
  selected,
  names,
  seen,
  onChange,
  onDone,
}: {
  selected: string[];
  /** Display names already known, by address. */
  names: Map<string, string>;
  /** Senders on the page right now, offered before anything is typed. */
  seen: SenderSuggestionDto[];
  onChange: (next: string[]) => void;
  onDone: () => void;
}) {
  const api = useApi();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SenderSuggestionDto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api
        .get<SenderSuggestionDto[]>(`/api/clear-out/senders?q=${encodeURIComponent(term.trim())}`)
        .then((value) => live && setResults(value))
        .catch(() => live && setResults([]))
        .finally(() => live && setLoading(false));
    }, term ? 260 : 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [api, term]);

  const needle = term.trim().toLowerCase();
  const options = useMemo(() => {
    const map = new Map<string, SenderSuggestionDto>();
    // Results still on screen from an earlier term are narrowed too, until
    // the new answer arrives.
    const matches = (s: SenderSuggestionDto) =>
      !needle || s.address.includes(needle) || (s.name ?? "").toLowerCase().includes(needle);
    for (const s of [...seen, ...results].filter(matches)) {
      if (!map.has(s.address)) map.set(s.address, s);
    }
    return [...map.values()].slice(0, 12);
  }, [seen, results, needle]);

  const exact = isSenderAddress(needle) && !options.some((s) => s.address === needle) ? needle : null;
  const full = selected.length >= MAX_SENDERS;

  const toggle = (address: string) => {
    if (selected.includes(address)) onChange(selected.filter((a) => a !== address));
    else if (!full) onChange([...selected, address]);
  };

  return (
    <div className={styles.picker}>
      <div className={styles.searchField}>
        <Search size={16} strokeWidth={1.8} className={styles.searchIcon} aria-hidden />
        <input
          type="search"
          className={styles.search}
          placeholder="Name or email address"
          aria-label="Search senders by name or email address"
          value={term}
          autoComplete="off"
          data-autofocus
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && exact) {
              event.preventDefault();
              toggle(exact);
              setTerm("");
            }
          }}
        />
      </div>

      {selected.length ? (
        <ul className={styles.chosen} aria-label="Chosen senders">
          {selected.map((address) => (
            <li key={address}>
              <button
                type="button"
                className={styles.chosenChip}
                onClick={() => toggle(address)}
                aria-label={`Remove ${names.get(address) ?? address}`}
              >
                <span className={styles.chipText}>{names.get(address) ?? address}</span>
                <X size={14} strokeWidth={2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.options} role="group" aria-label="Senders" aria-busy={loading || undefined}>
        {exact ? (
          <button type="button" className={styles.option} onClick={() => { toggle(exact); setTerm(""); }} disabled={full}>
            <span className={styles.optionMark} aria-hidden="true">
              <Plus size={15} strokeWidth={2} />
            </span>
            <span className={styles.optionText}>
              <span className={styles.optionName}>Use this exact address</span>
              <span className={styles.optionAddress}>{exact}</span>
            </span>
          </button>
        ) : null}

        {options.map((sender) => {
          const on = selected.includes(sender.address);
          return (
            <button
              key={sender.address}
              type="button"
              role="checkbox"
              aria-checked={on}
              className={styles.option}
              data-on={on || undefined}
              disabled={!on && full}
              onClick={() => toggle(sender.address)}
            >
              <span className={styles.optionMark} aria-hidden="true">
                {on ? <Check size={15} strokeWidth={2.4} /> : null}
              </span>
              <span className={styles.optionText}>
                <span className={styles.optionName}>{sender.name ?? sender.address}</span>
                {sender.name ? <span className={styles.optionAddress}>{sender.address}</span> : null}
              </span>
            </button>
          );
        })}

        {!loading && options.length === 0 && !exact ? (
          <p className={styles.emptyNote}>
            {needle ? "No senders found. Type a full email address to use it exactly." : "Type a name or an email address."}
          </p>
        ) : null}
      </div>

      <div className={styles.pickerFoot}>
        <p className={styles.footNote}>
          {selected.length > 1 ? "Showing mail from any of these senders." : full ? `Up to ${MAX_SENDERS} senders.` : ""}
        </p>
        <button type="button" className={styles.done} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
