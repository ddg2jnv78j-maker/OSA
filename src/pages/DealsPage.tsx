import React, { useEffect, useState } from 'react';
import {
  ShoppingBag,
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  Info,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { AffiliateProduct } from '../types/osa';
import { TranslationDictionary } from '../lib/i18n';
import { fetchActiveAffiliateProducts } from '../services/osaService';
import { AffiliateProductCard } from '../components/AffiliateProductCard';

interface DealsPageProps {
  t: TranslationDictionary;
}

export const DealsPage: React.FC<DealsPageProps> = ({ t }) => {
  const [products, setProducts] = useState<AffiliateProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadProducts = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await fetchActiveAffiliateProducts({
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        limit: 50,
      });
      setProducts(data);
    } catch (err: unknown) {
      // In development or if migrations are not deployed, handle gracefully
      const msg =
        err instanceof Error ? err.message : 'Could not load affiliate deals.';
      setError(msg);
      setProducts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [selectedCategory]);

  const categories = [
    { id: 'all', label: t.categoriesAll },
    { id: 'electronics', label: t.categoriesElectronics },
    { id: 'fashion', label: t.categoriesFashion },
    { id: 'home', label: t.categoriesHome },
    { id: 'books', label: t.categoriesBooks },
  ];

  const filteredProducts = products.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.merchant?.display_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      {/* Header Banner & Disclosure */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-6 shrink-0">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>OSA Shopping & Deals</span>
              </div>
              <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {t.affiliateTitle}
              </h1>
              <p className="mt-1 text-xs md:text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
                {t.affiliateSubtitle}
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadProducts(true)}
              disabled={refreshing || loading}
              className="self-start md:self-auto px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-2 shadow-xs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
              />
              <span>Refresh Deals</span>
            </button>
          </div>

          {/* Search Bar & Category Filters */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search deals, gadgets, brands..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs md:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1 mr-0.5 hidden sm:block" />
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategory(c.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedCategory === c.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Transparent Affiliate FTC Disclosure */}
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 font-medium">
              {t.affiliateDisclosure}
            </p>
          </div>
        </div>
      </div>

      {/* Main Deals Grid Area */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-8">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-xs font-medium">Loading verified deals...</p>
          </div>
        ) : error ? (
          <div className="py-16 px-6 max-w-md mx-auto text-center flex flex-col items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Deals Feed Notice
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {t.noDealsDesc}
            </p>
            <button
              type="button"
              onClick={() => loadProducts(true)}
              className="mt-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-16 px-6 max-w-md mx-auto text-center flex flex-col items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t.noDealsFound}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {t.noDealsDesc}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredProducts.map((product) => (
              <AffiliateProductCard
                key={product.id}
                product={product}
                t={t}
                compact={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
