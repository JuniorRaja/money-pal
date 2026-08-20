/**
 * Icon picker component with search and grouped display.
 * Shows curated finance-relevant icons organized by category.
 */
import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import {
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  ICON_GROUPS,
  getCategoryIcon,
  type CategoryIconName,
  type CategoryColorToken,
} from "@/lib/category-icons";
import { cn } from "@/lib/utils";

interface IconPickerProps {
  /** Currently selected icon name */
  value: string;
  /** Called when an icon is selected */
  onChange: (icon: string) => void;
  /** Currently selected color token */
  colorValue?: string;
  /** Called when a color is selected */
  onColorChange?: (color: string) => void;
  /** Whether to show color picker */
  showColorPicker?: boolean;
  /** Optional className for the container */
  className?: string;
}

export function IconPicker({
  value,
  onChange,
  colorValue = "chart-1",
  onColorChange,
  showColorPicker = true,
  className,
}: IconPickerProps) {
  const [search, setSearch] = useState("");

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return ICON_GROUPS;

    const q = search.toLowerCase();
    const result: Record<string, readonly string[]> = {};

    for (const [groupName, icons] of Object.entries(ICON_GROUPS)) {
      const matching = icons.filter((icon) => icon.includes(q));
      if (matching.length > 0) {
        result[groupName] = matching;
      }
    }

    return result;
  }, [search]);

  const selectedColor = colorValue;
  const colorStyle = {
    color: `var(--color-${selectedColor})`,
  };

  return (
    <div className={cn("flex gap-4", className)}>
      {/* Icon grid */}
      <div className="flex-1 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search icons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground outline-none focus:border-primary/60"
          />
        </div>

        {/* Icon groups */}
        <div className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
          {Object.entries(filteredGroups).map(([groupName, icons]) => (
            <div key={groupName}>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {groupName}
              </p>
              <div className="flex flex-wrap gap-0.5">
                {icons.map((iconName) => {
                  const Icon = getCategoryIcon(iconName);
                  const isSelected = value === iconName;
                  return (
                    <button
                      key={iconName}
                      type="button"
                      title={iconName}
                      onClick={() => onChange(iconName)}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded border transition-colors",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-transparent hover:border-border hover:bg-accent/50",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" style={colorStyle} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {Object.keys(filteredGroups).length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No icons match "{search}"
            </p>
          )}
        </div>
      </div>

      {/* Color picker sidebar */}
      {showColorPicker && onColorChange && (
        <div className="w-12 space-y-1.5 border-l border-border/60 pl-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Color
          </p>
          <div className="flex flex-col gap-1">
            {CATEGORY_COLORS.map((color) => {
              const isSelected = colorValue === color;
              return (
                <button
                  key={color}
                  type="button"
                  title={color}
                  onClick={() => onColorChange(color)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded border transition-colors",
                    isSelected
                      ? "border-primary"
                      : "border-transparent hover:border-border",
                  )}
                >
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: `var(--color-${color})` }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
