import { useSession } from "@/components/session";

/**
 * Maps each digit (and common currency symbols) to a unique braille pattern.
 * This creates a visually distinct but unreadable representation.
 */
const BRAILLE_MAP: Record<string, string> = {
  "0": "⠚", // ⠚
  "1": "⠁", // ⠁
  "2": "⠃", // ⠃
  "3": "⠉", // ⠉
  "4": "⠙", // ⠙
  "5": "⠑", // ⠑
  "6": "⠋", // ⠋
  "7": "⠛", // ⠛
  "8": "⠓", // ⠓
  "9": "⠊", // ⠊
  ",": "⠂", // comma
  ".": "⠲", // period
  "-": "⠤", // minus
  "+": "⠖", // plus
  "₹": "⠷", // rupee
  "$": "⠫", // dollar
  "€": "⠑", // euro
  "£": "⠇", // pound
  " ": " ", // preserve spaces
};

/**
 * Converts a string to braille-like dots where each character
 * maps to a unique braille pattern.
 */
function toBraille(text: string): string {
  return text
    .split("")
    .map((char) => BRAILLE_MAP[char] ?? char)
    .join("");
}

interface MaskedTextProps {
  children: string;
  className?: string;
}

/**
 * Renders text that gets converted to braille patterns when privacy mode is enabled.
 * Each digit maps to a unique braille character, making it look like encoded data.
 */
export function MaskedText({ children, className = "" }: MaskedTextProps) {
  const { prefs } = useSession();

  const displayText = prefs.maskNumbers ? toBraille(children) : children;

  return (
    <span className={`${className} ${prefs.maskNumbers ? "select-none" : ""}`}>{displayText}</span>
  );
}
