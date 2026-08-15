import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Flag, Search, Wallet } from "lucide-react";
import { useState } from "react";

import type { NavItem } from "@/components/app-shell";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getAccounts, getGoals } from "@/data/repository";

/**
 * Ctrl/Cmd+K palette. Navigation only — accounts and goals are fetched on open
 * rather than kept in a global index, and free text is handed to the
 * transactions page's existing search instead of querying the DB here.
 */
export function CommandPalette({
  open,
  onOpenChange,
  nav,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nav: readonly NavItem[];
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const { data } = useQuery({
    queryKey: ["command-palette"],
    queryFn: async () => {
      const [accounts, goals] = await Promise.all([getAccounts(), getGoals()]);
      return { accounts, goals };
    },
    enabled: open,
  });

  // Escape and the overlay both land here, so this is where the query resets.
  const setOpen = (next: boolean) => {
    if (!next) setQuery("");
    onOpenChange(next);
  };

  const go = (run: () => void) => {
    setOpen(false);
    run();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <DialogTitle className="sr-only">Command palette</DialogTitle>
      <DialogDescription className="sr-only">
        Jump to a page, account or goal, or search your transactions.
      </DialogDescription>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Go to a page, account or goal — or search transactions…"
      />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>
        <CommandGroup heading="Go to">
          {nav.map((item) => (
            <CommandItem
              key={item.to}
              value={item.label}
              onSelect={() => go(() => navigate({ to: item.to }))}
            >
              <item.icon />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {data && data.accounts.length > 0 && (
          <CommandGroup heading="Accounts">
            {data.accounts.map((account) => (
              <CommandItem
                key={account.id}
                value={`${account.name} ${account.institution}`}
                onSelect={() => go(() => navigate({ to: "/accounts" }))}
              >
                <Wallet />
                {account.name}
                <span className="ml-auto text-xs text-muted-foreground">{account.institution}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {data && data.goals.length > 0 && (
          <CommandGroup heading="Goals">
            {data.goals.map((goal) => (
              <CommandItem
                key={goal.id}
                value={goal.name}
                onSelect={() => go(() => navigate({ to: "/goals" }))}
              >
                <Flag />
                {goal.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {/* Rendered last so an exact account/goal name wins the score tie. The
            value is the query itself, so this row always survives the filter. */}
        {query.trim() && (
          <CommandGroup heading="Search">
            <CommandItem
              value={query}
              onSelect={() => {
                const q = query.trim();
                go(() => navigate({ to: "/transactions", search: { q } }));
              }}
            >
              <Search />
              Search transactions for “{query.trim()}”
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
