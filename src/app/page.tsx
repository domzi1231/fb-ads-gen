"use client";
import { useEffect, useState } from "react";

type AdItem = {
  title: string;
  description: string;
  cta: string;
};

type HistoryEntry = {
  id: string;
  createdAt: number;
  url?: string;
  customPrompt?: string;
  label: string;
  ads: AdItem[];
};

type FavoriteAd = {
  id: string;
  title: string;
  description: string;
  cta: string;
  createdAt: number;
  source?: string; // URL ali label iz zgodovine
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ads, setAds] = useState<AdItem[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [language, setLanguage] = useState("Slovenian");
  const [translateTo, setTranslateTo] = useState<string>("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [sidebarOpen] = useState(true);
  const [favorites, setFavorites] = useState<FavoriteAd[]>([]);
  const [selectedFavorites, setSelectedFavorites] = useState<Set<string>>(new Set());
  const [sidebarTab, setSidebarTab] = useState<"history" | "favorites">("history");
  const [recentlyAddedFavorites, setRecentlyAddedFavorites] = useState<Set<string>>(new Set());

  function loadHistory() {
    try {
      const raw = localStorage.getItem("hs_ads_history");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setHistory(parsed);
    } catch {}
  }

  function persistHistory(next: HistoryEntry[]) {
    try {
      localStorage.setItem("hs_ads_history", JSON.stringify(next));
    } catch {}
  }

  function loadFavorites() {
    try {
      const raw = localStorage.getItem("hs_ads_favorites");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setFavorites(parsed);
    } catch {}
  }

  function persistFavorites(next: FavoriteAd[]) {
    try {
      localStorage.setItem("hs_ads_favorites", JSON.stringify(next));
    } catch {}
  }

  function pushHistory(entry: Omit<HistoryEntry, "id" | "createdAt">) {
    const newEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      ...entry,
    };
    setHistory((prev) => {
      const next = [newEntry, ...prev].slice(0, 100);
      persistHistory(next);
      return next;
    });
    setSelectedHistoryId(newEntry.id);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAds([]);
    if (!url) {
      setError("Vnesi URL produkta.");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch("/api/generate-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, customPrompt, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Napaka pri generiranju.");
      setAds(data.ads || []);
      pushHistory({
        url,
        customPrompt,
        label: new URL(url).hostname.replace("www.", ""),
        ads: data.ads || [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Neznana napaka";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function copyAd(ad: AdItem) {
    const text = `${ad.title}\n\n${ad.description}\n\nCTA: ${ad.cta}`;
    navigator.clipboard.writeText(text);
  }

  function isAdInFavorites(ad: AdItem): boolean {
    return favorites.some(fav => 
      fav.title === ad.title && 
      fav.description === ad.description && 
      fav.cta === ad.cta
    );
  }

  function addToFavorites(ad: AdItem, source?: string) {
    // Preveri, ali je oglas že v favorite
    if (isAdInFavorites(ad)) {
      return; // Ne dodajaj podvojenih oglasov
    }

    const favoriteAd: FavoriteAd = {
      id: crypto.randomUUID(),
      title: ad.title,
      description: ad.description,
      cta: ad.cta,
      createdAt: Date.now(),
      source,
    };
    setFavorites((prev) => {
      const next = [favoriteAd, ...prev];
      persistFavorites(next);
      return next;
    });

    // Dodaj vizualno povratno informacijo
    const adKey = `${ad.title}-${ad.description}-${ad.cta}`;
    setRecentlyAddedFavorites((prev) => {
      const next = new Set(prev);
      next.add(adKey);
      return next;
    });

    // Odstrani vizualno povratno informacijo po 2 sekundah
    setTimeout(() => {
      setRecentlyAddedFavorites((prev) => {
        const next = new Set(prev);
        next.delete(adKey);
        return next;
      });
    }, 2000);
  }

  function removeFromFavorites(id: string) {
    setFavorites((prev) => {
      const next = prev.filter((fav) => fav.id !== id);
      persistFavorites(next);
      return next;
    });
    setSelectedFavorites((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleFavoriteSelection(id: string) {
    setSelectedFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function exportSelectedToCSV() {
    const selectedFavs = favorites.filter((fav) => selectedFavorites.has(fav.id));
    if (selectedFavs.length === 0) return;

    const csvContent = [
      ["Naslov", "Opis", "CTA", "Vir", "Datum"],
      ...selectedFavs.map((fav) => [
        fav.title,
        fav.description.replace(/\n/g, " "),
        fav.cta,
        fav.source || "",
        new Date(fav.createdAt).toLocaleString(),
      ]),
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `facebook-ads-export-${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function selectAllFavorites() {
    const allFavoriteIds = new Set(favorites.map(fav => fav.id));
    setSelectedFavorites(allFavoriteIds);
  }

  function deselectAllFavorites() {
    setSelectedFavorites(new Set());
  }

  async function generateVariants(base: AdItem, _index: number) {
    try {
      setLoading(true);
      const res = await fetch("/api/generate-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantOf: base, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Napaka pri generiranju.");
      // Zamenjaj izbran oglas s tremi novimi za boljšo preglednost: dodamo jih za obstoječe
      // Preprosto dodaj na konec
      setAds((prev) => [...prev, ...data.ads]);
      pushHistory({
        label: `Variacije: ${base.title.slice(0, 24)}`,
        ads: data.ads || [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Neznana napaka";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // naloži zgodovino in favorite po montaži na klientu
  useEffect(() => {
    loadHistory();
    loadFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-foreground">
      <main className="max-w-6xl mx-auto px-6 py-14 flex gap-6">
        {/* Sidebar */}
        <aside className={`hidden md:block w-72 shrink-0 ${sidebarOpen ? "" : "opacity-70"}`}>
          <div className="sticky top-6">
            {/* Tab Navigation */}
            <div className="flex mb-3 border-b border-white/10">
              <button
                onClick={() => setSidebarTab("history")}
                className={`flex-1 text-sm font-medium py-2 px-3 text-center ${
                  sidebarTab === "history" 
                    ? "text-white border-b-2 border-white/30" 
                    : "text-white/60 hover:text-white/80"
                }`}
              >
                Zgodovina
              </button>
              <button
                onClick={() => setSidebarTab("favorites")}
                className={`flex-1 text-sm font-medium py-2 px-3 text-center ${
                  sidebarTab === "favorites" 
                    ? "text-white border-b-2 border-white/30" 
                    : "text-white/60 hover:text-white/80"
                }`}
              >
                Favorite ({favorites.length})
              </button>
            </div>

            {/* History Tab */}
            {sidebarTab === "history" && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-white/80">Zgodovina</h2>
                  <button onClick={() => { setHistory([]); persistHistory([]); }} className="text-xs text-white/50 hover:text-white/80">Počisti</button>
                </div>
                <div className="space-y-2">
                  {history.length === 0 && (
                    <div className="text-xs text-white/40">Ni shranjenih vnosov.</div>
                  )}
                  {history.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => { setSelectedHistoryId(h.id); setAds(h.ads); }}
                      className={`w-full text-left rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5 ${selectedHistoryId === h.id ? "bg-white/10" : ""}`}
                    >
                      <div className="text-sm truncate">{h.label}</div>
                      <div className="text-[10px] text-white/50">{new Date(h.createdAt).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Favorites Tab */}
            {sidebarTab === "favorites" && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-white/80">Favorite oglasi</h2>
                  <div className="flex gap-2">
                    {favorites.length > 0 && (
                      <button
                        onClick={selectedFavorites.size === favorites.length ? deselectAllFavorites : selectAllFavorites}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        {selectedFavorites.size === favorites.length ? "Odznači vse" : "Označi vse"}
                      </button>
                    )}
                    {selectedFavorites.size > 0 && (
                      <button
                        onClick={exportSelectedToCSV}
                        className="text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        Export CSV ({selectedFavorites.size})
                      </button>
                    )}
                    <button 
                      onClick={() => { setFavorites([]); persistFavorites([]); setSelectedFavorites(new Set()); }} 
                      className="text-xs text-white/50 hover:text-white/80"
                    >
                      Počisti
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {favorites.length === 0 && (
                    <div className="text-xs text-white/40">Ni shranjenih favorite oglasov.</div>
                  )}
                  {favorites.map((fav) => (
                    <div
                      key={fav.id}
                      className={`rounded-lg border border-white/10 p-3 hover:bg-white/5 ${
                        selectedFavorites.has(fav.id) ? "bg-white/10" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedFavorites.has(fav.id)}
                          onChange={() => toggleFavoriteSelection(fav.id)}
                          className="mt-1 rounded border-white/20 bg-transparent"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{fav.title}</div>
                          <div className="text-xs text-white/60 mt-1 line-clamp-2">{fav.description}</div>
                          <div className="text-[10px] text-white/50 mt-1">
                            {fav.source && `${fav.source} • `}
                            {new Date(fav.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <button
                          onClick={() => removeFromFavorites(fav.id)}
                          className="text-white/40 hover:text-red-400 text-xs"
                          title="Odstrani iz favorite"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Generator Facebook oglasov</h1>
          <p className="text-sm text-white/60 mt-1">Vnesi URL produkta in po želji dodaj navodila za ton, občinstvo ali CTA.</p>
        </header>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 mb-10 rounded-xl border border-white/10 bg-zinc-900/50 p-4 backdrop-blur-sm">
          <input
            type="url"
            placeholder="Vnesi URL produkta"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-md border border-white/10 bg-transparent px-4 py-2 outline-none focus:ring-2 focus:ring-white/20"
            required
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <textarea
            placeholder="Custom prompt (neobvezno) — npr. ton, ciljno občinstvo, omejitve znakov ..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={4}
            className="md:col-span-2 w-full rounded-md border border-white/10 bg-transparent px-4 py-2 outline-none focus:ring-2 focus:ring-white/20"
          />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-md border border-white/10 bg-transparent px-4 py-2 outline-none focus:ring-2 focus:ring-white/20"
            >
              {[
                "Bulgarian","Croatian","Czech","Danish","Dutch","English","Estonian","Finnish","French","German","Greek","Hungarian","Irish","Italian","Latvian","Lithuanian","Maltese","Polish","Portuguese","Romanian","Slovak","Slovenian","Spanish","Swedish"
              ].map((lang) => (
                <option key={lang} value={lang} className="bg-zinc-900">{lang}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={translateTo}
              onChange={(e) => setTranslateTo(e.target.value)}
              className="rounded-md border border-white/10 bg-transparent px-4 py-2 outline-none focus:ring-2 focus:ring-white/20"
            >
              <option value="" className="bg-zinc-900">Prevedi v … (neobvezno)</option>
              {[
                "Bulgarian","Croatian","Czech","Danish","Dutch","English","Estonian","Finnish","French","German","Greek","Hungarian","Irish","Italian","Latvian","Lithuanian","Maltese","Polish","Portuguese","Romanian","Slovak","Slovenian","Spanish","Swedish"
              ].map((lang) => (
                <option key={lang} value={lang} className="bg-zinc-900">{lang}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!ads.length || !translateTo || loading}
              onClick={async () => {
                try {
                  setLoading(true);
                  const res = await fetch("/api/translate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ads, targetLanguage: translateTo }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data?.error || "Napaka pri prevodu.");
                  setAds(data.ads);
                  pushHistory({ label: `Prevod v ${translateTo}`, ads: data.ads });
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : "Neznana napaka";
                  setError(message);
                } finally {
                  setLoading(false);
                }
              }}
              className="rounded-md border border-white/10 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-60"
            >
              Prevedi trenutno
            </button>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-white text-black px-4 py-2 font-medium hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Generiram..." : "Generiraj oglase"}
          </button>
        </form>

        {error && (
          <div className="mb-6 text-sm text-red-400">{error}</div>
        )}

        {loading && (
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            {[0,1,2].map((i) => (
              <div key={i} className="rounded-xl border border-white/10 p-4 bg-zinc-900/50 animate-pulse">
                <div className="h-4 w-2/3 bg-white/10 rounded mb-3" />
                <div className="h-3 w-full bg-white/10 rounded mb-2" />
                <div className="h-3 w-5/6 bg-white/10 rounded mb-4" />
                <div className="h-6 w-24 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {ads.map((ad, idx) => (
            <div key={idx} className="rounded-xl border border-white/10 p-4 flex flex-col justify-between bg-zinc-900/50">
              <div>
                <h3 className="font-semibold mb-2">{ad.title}</h3>
                <p className="text-sm text-white/80 mb-4 whitespace-pre-wrap">{ad.description}</p>
                <span className="inline-block text-xs rounded bg-white/10 px-2 py-1">CTA: {ad.cta}</span>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => copyAd(ad)}
                  className="flex-1 rounded-md border border-white/15 px-3 py-2 text-sm hover:bg-white/10"
                >
                  Copy
                </button>
                <button
                  onClick={() => addToFavorites(ad, selectedHistoryId ? history.find(h => h.id === selectedHistoryId)?.label : undefined)}
                  className={`rounded-md border px-3 py-2 text-sm transition-all duration-200 ${
                    isAdInFavorites(ad)
                      ? "border-green-400/50 text-green-300 bg-green-400/10"
                      : recentlyAddedFavorites.has(`${ad.title}-${ad.description}-${ad.cta}`)
                      ? "border-green-400/50 text-green-300 bg-green-400/20 animate-pulse"
                      : "border-yellow-400/30 text-yellow-300 hover:bg-yellow-400/10"
                  }`}
                  title={isAdInFavorites(ad) ? "Že v favorite" : "Dodaj med favorite"}
                  disabled={isAdInFavorites(ad)}
                >
                  {isAdInFavorites(ad) ? "✅" : recentlyAddedFavorites.has(`${ad.title}-${ad.description}-${ad.cta}`) ? "✅" : "⭐"}
                </button>
              </div>
              <button
                onClick={() => generateVariants(ad, idx)}
                disabled={loading}
                className="mt-2 rounded-md border border-emerald-400/30 text-emerald-300 px-3 py-2 text-sm hover:bg-emerald-400/10 disabled:opacity-60"
              >
                Podobne variacije
              </button>
            </div>
          ))}
        </div>
        </div>
      </main>
    </div>
  );
}
