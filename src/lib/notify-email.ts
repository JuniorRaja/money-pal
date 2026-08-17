/**
 * Monthly email report formatter for P3-3.
 *
 * Generates an HTML email summarizing the month's financial activity:
 * - Cashflow (income, expense, net)
 * - Top spending categories
 * - Budget progress
 * - Goal progress
 * - Holdings summary
 *
 * Pure and framework-free so it can be unit-tested without server machinery.
 */

import type { Paise } from "@/data/schema";

/** Data shape for the monthly report - matches what the views provide. */
export interface MonthlyReportData {
  period: string; // "2026-08"
  displayName: string; // User's display name
  cashflow: {
    income: Paise;
    expense: Paise;
    net: Paise;
    txnCount: number;
  };
  topCategories: Array<{
    name: string;
    spent: Paise;
    colorToken: string;
  }>;
  budgets: Array<{
    categoryName: string;
    planned: Paise;
    spent: Paise;
    colorToken: string;
  }>;
  goals: Array<{
    name: string;
    target: Paise;
    saved: Paise;
    targetDate: string | null;
  }>;
  holdings: {
    totalValue: Paise;
    totalInvested: Paise;
  };
}

const indianFormat = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatRupees(paise: Paise): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? "-" : "";
  return `${sign}\u20B9${indianFormat.format(rupees)}`;
}

function formatCompact(paise: Paise): string {
  const rupees = Math.abs(paise) / 100;
  if (rupees >= 1e7) return `\u20B9${(rupees / 1e7).toFixed(1)} Cr`;
  if (rupees >= 1e5) return `\u20B9${(rupees / 1e5).toFixed(1)} L`;
  return `\u20B9${indianFormat.format(rupees)}`;
}

function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function progressPercent(spent: Paise, planned: Paise): number {
  if (planned === 0) return 0;
  return Math.min(100, Math.round((spent / planned) * 100));
}

function goalPercent(saved: Paise, target: Paise): number {
  if (target === 0) return 0;
  return Math.min(100, Math.round((saved / target) * 100));
}

/**
 * CSS color mapping for color tokens used in the app.
 * Falls back to a neutral gray for unknown tokens.
 */
function tokenToHex(token: string): string {
  const colors: Record<string, string> = {
    red: "#ef4444",
    orange: "#f97316",
    amber: "#f59e0b",
    yellow: "#eab308",
    lime: "#84cc16",
    green: "#22c55e",
    emerald: "#10b981",
    teal: "#14b8a6",
    cyan: "#06b6d4",
    sky: "#0ea5e9",
    blue: "#3b82f6",
    indigo: "#6366f1",
    violet: "#8b5cf6",
    purple: "#a855f7",
    fuchsia: "#d946ef",
    pink: "#ec4899",
    rose: "#f43f5e",
    slate: "#64748b",
    gray: "#6b7280",
    zinc: "#71717a",
    neutral: "#737373",
    stone: "#78716c",
  };
  return colors[token] || "#6b7280";
}

/**
 * Format the monthly report as HTML email.
 * Returns null if there's no meaningful data to report.
 */
export function formatMonthlyReportHtml(data: MonthlyReportData): string | null {
  // Skip if no transactions this month
  if (data.cashflow.txnCount === 0) return null;

  const periodDisplay = formatPeriod(data.period);
  const netColor = data.cashflow.net >= 0 ? "#16a34a" : "#dc2626";
  const netSign = data.cashflow.net >= 0 ? "+" : "";

  // Build sections
  const budgetRows = data.budgets
    .slice(0, 6)
    .map((b) => {
      const pct = progressPercent(b.spent, b.planned);
      const overBudget = b.spent > b.planned;
      return `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${tokenToHex(b.colorToken)}; margin-right: 8px;"></span>
            ${b.categoryName}
          </td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">
            ${formatRupees(b.spent)} / ${formatRupees(b.planned)}
          </td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: ${overBudget ? "#dc2626" : "#6b7280"};">
            ${pct}%
          </td>
        </tr>
      `;
    })
    .join("");

  const goalRows = data.goals
    .slice(0, 5)
    .map((g) => {
      const pct = goalPercent(g.saved, g.target);
      return `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${g.name}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">
            ${formatCompact(g.saved)} / ${formatCompact(g.target)}
          </td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #6b7280;">
            ${pct}%
          </td>
        </tr>
      `;
    })
    .join("");

  const categoryPills = data.topCategories
    .slice(0, 5)
    .map(
      (c) => `
        <span style="display: inline-block; background: ${tokenToHex(c.colorToken)}15; color: ${tokenToHex(c.colorToken)}; padding: 4px 12px; border-radius: 16px; margin: 4px 4px 4px 0; font-size: 13px;">
          ${c.name}: ${formatRupees(c.spent)}
        </span>
      `
    )
    .join("");

  const holdingsGain = data.holdings.totalValue - data.holdings.totalInvested;
  const holdingsGainPct =
    data.holdings.totalInvested > 0
      ? ((holdingsGain / data.holdings.totalInvested) * 100).toFixed(1)
      : "0";
  const holdingsColor = holdingsGain >= 0 ? "#16a34a" : "#dc2626";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Money Pal - ${periodDisplay} Report</title>
</head>
<body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); border-radius: 12px 12px 0 0; padding: 24px; color: white;">
      <h1 style="margin: 0 0 4px 0; font-size: 24px; font-weight: 600;">Money Pal</h1>
      <p style="margin: 0; opacity: 0.9; font-size: 14px;">Monthly Financial Report</p>
    </div>
    
    <!-- Main Content -->
    <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      
      <p style="color: #374151; margin: 0 0 20px 0;">
        Hi ${data.displayName || "there"},<br><br>
        Here's your financial summary for <strong>${periodDisplay}</strong>.
      </p>
      
      <!-- Cashflow Summary -->
      <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px 0; font-size: 16px; color: #374151; font-weight: 600;">Monthly Cashflow</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0;">
              <span style="color: #6b7280;">Income</span>
            </td>
            <td style="padding: 8px 0; text-align: right; color: #16a34a; font-weight: 500;">
              +${formatRupees(data.cashflow.income)}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <span style="color: #6b7280;">Expenses</span>
            </td>
            <td style="padding: 8px 0; text-align: right; color: #dc2626; font-weight: 500;">
              -${formatRupees(data.cashflow.expense)}
            </td>
          </tr>
          <tr style="border-top: 2px solid #e5e7eb;">
            <td style="padding: 12px 0 0 0;">
              <span style="color: #374151; font-weight: 600;">Net</span>
            </td>
            <td style="padding: 12px 0 0 0; text-align: right; color: ${netColor}; font-weight: 600; font-size: 18px;">
              ${netSign}${formatRupees(data.cashflow.net)}
            </td>
          </tr>
        </table>
        <p style="margin: 12px 0 0 0; color: #9ca3af; font-size: 13px;">
          ${data.cashflow.txnCount} transactions recorded
        </p>
      </div>
      
      <!-- Top Categories -->
      ${
        data.topCategories.length > 0
          ? `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px 0; font-size: 16px; color: #374151; font-weight: 600;">Top Spending</h2>
        <div>${categoryPills}</div>
      </div>
      `
          : ""
      }
      
      <!-- Budget Progress -->
      ${
        data.budgets.length > 0
          ? `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px 0; font-size: 16px; color: #374151; font-weight: 600;">Budget Progress</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="color: #9ca3af; font-size: 12px; text-transform: uppercase;">
              <th style="padding: 8px 0; text-align: left; font-weight: 500;">Category</th>
              <th style="padding: 8px 0; text-align: right; font-weight: 500;">Spent / Planned</th>
              <th style="padding: 8px 0; text-align: right; font-weight: 500;">Used</th>
            </tr>
          </thead>
          <tbody>
            ${budgetRows}
          </tbody>
        </table>
      </div>
      `
          : ""
      }
      
      <!-- Goals Progress -->
      ${
        data.goals.length > 0
          ? `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px 0; font-size: 16px; color: #374151; font-weight: 600;">Goal Progress</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="color: #9ca3af; font-size: 12px; text-transform: uppercase;">
              <th style="padding: 8px 0; text-align: left; font-weight: 500;">Goal</th>
              <th style="padding: 8px 0; text-align: right; font-weight: 500;">Saved / Target</th>
              <th style="padding: 8px 0; text-align: right; font-weight: 500;">Progress</th>
            </tr>
          </thead>
          <tbody>
            ${goalRows}
          </tbody>
        </table>
      </div>
      `
          : ""
      }
      
      <!-- Holdings -->
      ${
        data.holdings.totalInvested > 0
          ? `
      <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px 0; font-size: 16px; color: #374151; font-weight: 600;">Investments</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Current Value</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 500;">${formatCompact(data.holdings.totalValue)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Total Invested</td>
            <td style="padding: 4px 0; text-align: right;">${formatCompact(data.holdings.totalInvested)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Overall Gain</td>
            <td style="padding: 4px 0; text-align: right; color: ${holdingsColor}; font-weight: 500;">
              ${holdingsGain >= 0 ? "+" : ""}${formatCompact(holdingsGain)} (${holdingsGainPct}%)
            </td>
          </tr>
        </table>
      </div>
      `
          : ""
      }
      
      <!-- Footer -->
      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 8px;">
        <p style="margin: 0; color: #9ca3af; font-size: 13px; text-align: center;">
          This report was generated automatically by Money Pal.<br>
          Manage your notification preferences in Settings.
        </p>
      </div>
      
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Format the monthly report as plain text (fallback for email clients).
 */
export function formatMonthlyReportText(data: MonthlyReportData): string | null {
  if (data.cashflow.txnCount === 0) return null;

  const periodDisplay = formatPeriod(data.period);
  const lines: string[] = [
    `Money Pal - ${periodDisplay} Report`,
    "=".repeat(40),
    "",
    `Hi ${data.displayName || "there"},`,
    "",
    "MONTHLY CASHFLOW",
    `  Income:   +${formatRupees(data.cashflow.income)}`,
    `  Expenses: -${formatRupees(data.cashflow.expense)}`,
    `  Net:      ${data.cashflow.net >= 0 ? "+" : ""}${formatRupees(data.cashflow.net)}`,
    `  (${data.cashflow.txnCount} transactions)`,
    "",
  ];

  if (data.topCategories.length > 0) {
    lines.push("TOP SPENDING");
    data.topCategories.slice(0, 5).forEach((c) => {
      lines.push(`  ${c.name}: ${formatRupees(c.spent)}`);
    });
    lines.push("");
  }

  if (data.budgets.length > 0) {
    lines.push("BUDGET PROGRESS");
    data.budgets.slice(0, 6).forEach((b) => {
      const pct = progressPercent(b.spent, b.planned);
      lines.push(`  ${b.categoryName}: ${formatRupees(b.spent)} / ${formatRupees(b.planned)} (${pct}%)`);
    });
    lines.push("");
  }

  if (data.goals.length > 0) {
    lines.push("GOAL PROGRESS");
    data.goals.slice(0, 5).forEach((g) => {
      const pct = goalPercent(g.saved, g.target);
      lines.push(`  ${g.name}: ${formatCompact(g.saved)} / ${formatCompact(g.target)} (${pct}%)`);
    });
    lines.push("");
  }

  if (data.holdings.totalInvested > 0) {
    const gain = data.holdings.totalValue - data.holdings.totalInvested;
    lines.push("INVESTMENTS");
    lines.push(`  Current Value: ${formatCompact(data.holdings.totalValue)}`);
    lines.push(`  Total Invested: ${formatCompact(data.holdings.totalInvested)}`);
    lines.push(`  Overall Gain: ${gain >= 0 ? "+" : ""}${formatCompact(gain)}`);
    lines.push("");
  }

  lines.push("-".repeat(40));
  lines.push("This report was generated by Money Pal.");

  return lines.join("\n");
}
