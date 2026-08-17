import { defineTask } from "nitro/task";

import { AMFI_NAV_URL, feedFor, parseAmfiNav, parseYahooQuote, yahooQuoteUrl } from "@/lib/prices";

/**
 * P3-4 — daily market price refresh. Scheduled from nitro.config.ts onto a
 * Cloudflare cron trigger; the app never fetches a price during a render.
 *
 * The rule the whole task is shaped around: a failed fetch, a delisted ticker or
 * a reshaped Yahoo response leaves the row exactly as it was — old price, old
 * `priced_at`. Never a zero. A zeroed holding silently understates the portfolio,
 * while a stale date is visibly stale in the UI. So every failure here is a
 * `continue`, never a throw, and one dead symbol never abandons the batch.
 */
export default defineTask({
  meta: {
    name: "prices:refresh",
    description: "Fetch AMFI NAVs and Yahoo quotes into holdings.last_price",
  },
  async run() {
    // Not imported at module scope: the Cloudflare env is bound per handler, and
    // the client throws on construction if it is read too early.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: holdings, error } = await supabaseAdmin
      .from("holdings")
      .select("id, symbol, asset_class, last_price, priced_at")
      .not("symbol", "is", null)
      .is("deleted_at", null);

    if (error) throw error;
    if (!holdings?.length) return { result: { priced: 0, stale: 0 } };

    // Distinct symbol per feed — two accounts holding the same fund is one fetch,
    // not two.
    const amfiCodes = new Set<string>();
    const yahooSymbols = new Set<string>();
    for (const h of holdings) {
      if (!h.symbol) continue;
      const feed = feedFor(h.asset_class);
      if (feed === "amfi") amfiCodes.add(h.symbol);
      else if (feed === "yahoo") yahooSymbols.add(h.symbol);
    }

    const prices = new Map<string, number>();

    // AMFI: one ~2 MB file covers every Indian scheme, so it is fetched once and
    // then looked up, never per holding.
    if (amfiCodes.size > 0) {
      try {
        const res = await fetch(AMFI_NAV_URL);
        if (!res.ok) throw new Error(`AMFI responded ${res.status}`);
        const navs = parseAmfiNav(await res.text());
        for (const code of amfiCodes) {
          const nav = navs.get(code);
          if (nav === undefined) {
            console.warn(`[prices] AMFI has no NAV for scheme ${code} — leaving it stale`);
            continue;
          }
          prices.set(code, nav);
        }
      } catch (e) {
        // The whole file failed: every fund stays at its last known price.
        console.error("[prices] AMFI fetch failed, all funds left stale:", e);
      }
    }

    // Yahoo: unofficial and ToS-grey, so it is assumed to fail. Sequential, one
    // symbol at a time — a handful of holdings does not need concurrency, and a
    // burst is what gets a datacenter IP throttled.
    for (const symbol of yahooSymbols) {
      try {
        const res = await fetch(yahooQuoteUrl(symbol), {
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new Error(`Yahoo responded ${res.status}`);
        const price = parseYahooQuote(await res.json());
        if (price === null) throw new Error("no usable price in response");
        prices.set(symbol, price);
      } catch (e) {
        console.warn(`[prices] ${symbol} left stale:`, e);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    let priced = 0;

    for (const h of holdings) {
      const price = h.symbol ? prices.get(h.symbol) : undefined;
      if (price === undefined) continue;

      // Roll yesterday's close forward only when the stored price is from an
      // earlier day. Without this a second run in the same day would overwrite
      // prev_price with today's own price and flatten the day change to zero.
      const isNewDay = !h.priced_at || h.priced_at.slice(0, 10) < today;

      const { error: updateError } = await supabaseAdmin
        .from("holdings")
        .update({
          last_price: price,
          priced_at: new Date().toISOString(),
          ...(isNewDay && h.last_price > 0 ? { prev_price: h.last_price } : {}),
        })
        .eq("id", h.id);

      if (updateError) {
        console.error(`[prices] failed to store price for holding ${h.id}:`, updateError);
        continue;
      }
      priced++;
    }

    // Stale is every holding that carries a symbol but did not get a new price
    // this run — the number worth watching if a feed quietly dies.
    const stale = holdings.length - priced;
    console.log(`[prices] priced=${priced} stale=${stale}`);
    return { result: { priced, stale } };
  },
});
