import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const TICKER_REGEX = /^[A-Z0-9.\-^=]{1,14}$/;

function toNyDate(unixSeconds?: number): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(unixSeconds * 1000));
}

async function fetchYahooQuote(symbol: string) {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; VaultLedger/1.0)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) continue;

      const json = await resp.json();
      const result = json?.chart?.result?.[0];
      const meta = result?.meta;
      const price = Number(meta?.regularMarketPrice);
      if (!Number.isFinite(price) || price <= 0) continue;

      const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
      const rawCloses: Array<number | null> = Array.isArray(result?.indicators?.quote?.[0]?.close)
        ? result.indicators.quote[0].close
        : [];

      let prevClose = Number(meta?.previousClose);
      if (!Number.isFinite(prevClose) || prevClose <= 0) {
        const marketDay = toNyDate(Number(meta?.regularMarketTime));
        const validBars: Array<{ day: string; close: number }> = [];
        for (let i = 0; i < Math.min(timestamps.length, rawCloses.length); i++) {
          const c = rawCloses[i];
          if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
            validBars.push({ day: toNyDate(timestamps[i]), close: c });
          }
        }
        if (validBars.length > 0) {
          const lastBar = validBars[validBars.length - 1];
          if (marketDay && lastBar.day === marketDay && validBars.length >= 2) {
            prevClose = validBars[validBars.length - 2].close;
          } else if (marketDay && lastBar.day !== marketDay) {
            prevClose = lastBar.close;
          } else if (validBars.length >= 2) {
            prevClose = validBars[validBars.length - 2].close;
          }
        }
      }

      if (!Number.isFinite(prevClose) || prevClose <= 0) {
        const fallbackPrev = Number(meta?.chartPreviousClose);
        prevClose = Number.isFinite(fallbackPrev) && fallbackPrev > 0 ? fallbackPrev : price;
      }

      const change = price - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      return {
        symbol,
        price: Number(price.toFixed(4)),
        prevClose: Number(prevClose.toFixed(4)),
        change: Number(change.toFixed(4)),
        changePct: Number(changePct.toFixed(2)),
        name: String(meta?.shortName || meta?.longName || symbol),
        currency: String(meta?.currency || 'USD'),
        source: 'yahoo',
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      // Try next host or fallback source
    }
  }
  return null;
}

async function fetchStooqQuote(symbol: string) {
  if (symbol.includes('^') || symbol.includes('=')) return null;
  try {
    const stooqSym = `${symbol.toLowerCase().replace('.', '-')}.us`;
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcvn&h&e=csv`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VaultLedger/1.0)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return null;

    const csv = (await resp.text()).trim();
    const lines = csv.split(/\r?\n/);
    if (lines.length < 2) return null;

    // Columns: Symbol,Date,Time,Open,High,Low,Close,Volume,Name
    const cols = lines[1].split(',');
    const close = Number(cols[6]);
    const open = Number(cols[3]);
    if (!Number.isFinite(close) || close <= 0) return null;

    const prevClose = Number.isFinite(open) && open > 0 ? open : close;
    const change = close - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol,
      price: Number(close.toFixed(4)),
      prevClose: Number(prevClose.toFixed(4)),
      change: Number(change.toFixed(4)),
      changePct: Number(changePct.toFixed(2)),
      name: String(cols[8] || symbol).replace(/^"|"$/g, ''),
      currency: 'USD',
      source: 'stooq',
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function fetchInrFallback() {
  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const rate = Number(json?.rates?.INR);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return {
      symbol: 'INR=X',
      price: Number(rate.toFixed(4)),
      prevClose: Number(rate.toFixed(4)),
      change: 0,
      changePct: 0,
      name: 'USD/INR',
      currency: 'INR',
      source: 'er-api',
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let rawSymbols: string[] = [];

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const q = url.searchParams.get('symbols') || '';
      rawSymbols = q.split(',');
    } else {
      const body = await req.json().catch(() => ({}));
      if (Array.isArray(body?.symbols)) {
        rawSymbols = body.symbols.map((s: unknown) => String(s ?? ''));
      } else if (typeof body?.symbols === 'string') {
        rawSymbols = body.symbols.split(',');
      }
    }

    const symbols = Array.from(
      new Set(
        rawSymbols
          .map((s) => s.trim().toUpperCase())
          .filter((s) => TICKER_REGEX.test(s))
      )
    ).slice(0, 40);

    if (symbols.length === 0) {
      return new Response(
        JSON.stringify({ quotes: {}, fetchedAt: new Date().toISOString() }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = await Promise.all(
      symbols.map(async (sym) => {
        const yahoo = await fetchYahooQuote(sym);
        if (yahoo) return yahoo;
        if (sym === 'INR=X') {
          return await fetchInrFallback();
        }
        const stooq = await fetchStooqQuote(sym);
        return stooq;
      })
    );

    const quotes: Record<string, unknown> = {};
    for (const q of results) {
      if (q) quotes[q.symbol] = q;
    }

    return new Response(
      JSON.stringify({ quotes, fetchedAt: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch quotes';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
