/**
 * Curated finance-relevant icons for category management.
 * Organized by semantic groups for easier browsing in the icon picker.
 */
import {
  Wallet,
  Banknote,
  Coins,
  PiggyBank,
  CreditCard,
  Home,
  Building,
  Key,
  Utensils,
  Coffee,
  ShoppingCart,
  ShoppingBag,
  Car,
  Fuel,
  Train,
  Plane,
  HeartPulse,
  Pill,
  Stethoscope,
  Tv,
  Music,
  Gamepad2,
  Film,
  Briefcase,
  Laptop,
  Building2,
  Zap,
  Droplet,
  Phone,
  Wifi,
  TrendingUp,
  BarChart,
  Landmark,
  Heart,
  Percent,
  ArrowLeftRight,
  Tag,
  Gift,
  Sparkles,
  Star,
  Circle,
  type LucideIcon,
} from "lucide-react";

/** Icon groups for organized display in the picker */
export const ICON_GROUPS = {
  Money: ["wallet", "banknote", "coins", "piggy-bank", "credit-card"],
  Home: ["home", "building", "key"],
  Food: ["utensils", "coffee", "shopping-cart", "shopping-bag"],
  Transport: ["car", "fuel", "train", "plane"],
  Health: ["heart-pulse", "pill", "stethoscope"],
  Entertainment: ["tv", "music", "gamepad-2", "film"],
  Work: ["briefcase", "laptop", "building-2"],
  Utilities: ["zap", "droplet", "phone", "wifi"],
  Investment: ["trending-up", "bar-chart", "landmark"],
  General: ["tag", "gift", "sparkles", "star"],
} as const;

/** Flat list of all available icon names */
export const CATEGORY_ICONS = [
  ...ICON_GROUPS.Money,
  ...ICON_GROUPS.Home,
  ...ICON_GROUPS.Food,
  ...ICON_GROUPS.Transport,
  ...ICON_GROUPS.Health,
  ...ICON_GROUPS.Entertainment,
  ...ICON_GROUPS.Work,
  ...ICON_GROUPS.Utilities,
  ...ICON_GROUPS.Investment,
  ...ICON_GROUPS.General,
] as const;

export type CategoryIconName = (typeof CATEGORY_ICONS)[number];

/** Icon component mapping */
export const categoryIconMap: Record<string, LucideIcon> = {
  wallet: Wallet,
  banknote: Banknote,
  coins: Coins,
  "piggy-bank": PiggyBank,
  "credit-card": CreditCard,
  home: Home,
  building: Building,
  key: Key,
  utensils: Utensils,
  coffee: Coffee,
  "shopping-cart": ShoppingCart,
  "shopping-bag": ShoppingBag,
  car: Car,
  fuel: Fuel,
  train: Train,
  plane: Plane,
  "heart-pulse": HeartPulse,
  pill: Pill,
  stethoscope: Stethoscope,
  tv: Tv,
  music: Music,
  "gamepad-2": Gamepad2,
  film: Film,
  briefcase: Briefcase,
  laptop: Laptop,
  "building-2": Building2,
  zap: Zap,
  droplet: Droplet,
  phone: Phone,
  wifi: Wifi,
  "trending-up": TrendingUp,
  "bar-chart": BarChart,
  landmark: Landmark,
  tag: Tag,
  gift: Gift,
  // Seeded categories (see the foundation migration) use these three names.
  // They are not offered in the picker, but must still render.
  heart: Heart,
  percent: Percent,
  "arrow-left-right": ArrowLeftRight,
  sparkles: Sparkles,
  star: Star,
};

/** Get icon component by name, with fallback to Circle */
export function getCategoryIcon(name: string): LucideIcon {
  return categoryIconMap[name] ?? Circle;
}

/** Check if a string is a valid category icon name */
export function isValidCategoryIcon(name: string): name is CategoryIconName {
  return name in categoryIconMap;
}

/** Available color tokens for categories */
export const CATEGORY_COLORS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;

export type CategoryColorToken = (typeof CATEGORY_COLORS)[number];
