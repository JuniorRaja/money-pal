import type { Category, Label } from "@/data/schema";

export const categories: Category[] = [
  { id: "cat_income", name: "Income", group: "income", icon: "briefcase", color_token: "success" },
  { id: "cat_housing", name: "Housing", group: "essentials", icon: "home", color_token: "chart-1" },
  { id: "cat_food", name: "Food", group: "essentials", icon: "utensils", color_token: "chart-2" },
  { id: "cat_transport", name: "Transport", group: "essentials", icon: "car", color_token: "chart-3" },
  { id: "cat_utilities", name: "Utilities", group: "essentials", icon: "zap", color_token: "chart-4" },
  { id: "cat_shopping", name: "Shopping", group: "lifestyle", icon: "shopping-cart", color_token: "chart-5" },
  { id: "cat_entertainment", name: "Entertainment", group: "lifestyle", icon: "music", color_token: "chart-2" },
  { id: "cat_subscriptions", name: "Subscriptions", group: "lifestyle", icon: "repeat", color_token: "chart-3" },
  { id: "cat_health", name: "Health", group: "essentials", icon: "heart-pulse", color_token: "chart-1" },
  { id: "cat_transfer", name: "Transfer", group: "transfer", icon: "arrow-left-right", color_token: "chart-4" },
  { id: "cat_investment", name: "Investment", group: "investment", icon: "trending-up", color_token: "chart-5" },
];

export const labels: Label[] = [
  { id: "lbl_personal", name: "Personal", color_token: "chart-2" },
  { id: "lbl_home", name: "Home", color_token: "chart-4" },
  { id: "lbl_mom", name: "Mom", color_token: "chart-3" },
  { id: "lbl_work", name: "Work", color_token: "chart-1" },
];
