import React, { useState } from 'react';
import {
  ExternalLink,
  CheckCircle2,
  Tag,
  ShoppingBag,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { AffiliateProduct } from '../types/osa';
import { TranslationDictionary } from '../lib/i18n';
import { trackAffiliateProductClick } from '../services/osaService';

interface AffiliateProductCardProps {
  product: AffiliateProduct;
  t: TranslationDictionary;
  compact?: boolean;
  onRedirectStart?: () => void;
  onRedirectComplete?: () => void;
}

export const AffiliateProductCard: React.FC<AffiliateProductCardProps> = ({
  product,
  t,
  compact = false,
  onRedirectStart,
  onRedirectComplete,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const merchantName = product.merchant?.display_name || 'Verified Merchant';
  const currency = product.currency || 'BDT';

  // Calculate discount percentage if original price is valid and greater than current price
  const hasDiscount =
    product.original_price != null &&
    product.original_price > product.current_price &&
    product.current_price > 0;

  const discountPercent = hasDiscount
    ? Math.round(
        ((product.original_price! - product.current_price) /
          product.original_price!) *
          100
      )
    : 0;

  const handleOpenDeal = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (redirecting) return;

    setErrorMsg('');
    setRedirecting(true);
    onRedirectStart?.();

    try {
      const result = await trackAffiliateProductClick({
        productId: product.id,
        referrerSource: compact ? 'chat_card' : 'deals_market',
        platform: 'web',
      });

      if (!result.destination_url) {
        throw new Error('Destination URL was not resolved safely.');
      }

      // Open verified destination URL securely
      window.open(result.destination_url, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Could not open product deal.';
      setErrorMsg(message);
    } finally {
      setRedirecting(false);
      onRedirectComplete?.();
    }
  };

  return (
    <div
      className={`group relative flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 ${
        compact ? 'max-w-sm' : 'w-full'
      }`}
    >
      {/* Product Image Area */}
      <div className="relative w-full aspect-4/3 bg-slate-100 dark:bg-slate-800/80 overflow-hidden flex items-center justify-center">
        {product.image_url && !imageError ? (
          <>
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800 animate-pulse">
                <ShoppingBag className="w-8 h-8 text-slate-400" />
              </div>
            )}
            <img
              src={product.image_url}
              alt={product.title}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-slate-400 dark:text-slate-500">
            <ShoppingBag className="w-10 h-10 stroke-1" />
            <span className="text-xs font-medium">OSA Product Preview</span>
          </div>
        )}

        {/* Merchant & Discount Badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 items-center">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 backdrop-blur-md shadow-xs">
            <CheckCircle2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            <span>{merchantName}</span>
          </span>

          {discountPercent > 0 && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500 text-white shadow-xs">
              <Tag className="w-3 h-3" />
              <span>{discountPercent}% OFF</span>
            </span>
          )}
        </div>

        {/* Stock / Availability Status Badge */}
        <div className="absolute bottom-3 right-3">
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide shadow-xs backdrop-blur-md ${
              product.availability_status === 'in_stock'
                ? 'bg-emerald-500/90 text-white'
                : product.availability_status === 'pre_order'
                ? 'bg-amber-500/90 text-white'
                : 'bg-slate-500/90 text-white'
            }`}
          >
            {product.availability_status === 'in_stock'
              ? t.inStock
              : product.availability_status === 'pre_order'
              ? t.preOrder
              : t.outOfStock}
          </span>
        </div>
      </div>

      {/* Product Content Details */}
      <div className="flex-1 p-4.5 flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            <span>{product.category}</span>
          </div>

          <h3
            className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
            title={product.title}
          >
            {product.title}
          </h3>

          {product.description && !compact && (
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
              {product.description}
            </p>
          )}
        </div>

        {/* Pricing & Call to Action */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-lg font-extrabold font-mono-num text-slate-900 dark:text-white">
              {currency} {Number(product.current_price).toLocaleString()}
            </span>

            {product.original_price != null && product.original_price > product.current_price && (
              <span className="text-xs font-mono-num text-slate-400 line-through">
                {currency} {Number(product.original_price).toLocaleString()}
              </span>
            )}
          </div>

          {errorMsg && (
            <div className="mb-2 p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleOpenDeal}
            disabled={redirecting || product.availability_status === 'out_of_stock'}
            className={`w-full py-2.5 px-4 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-all shadow-xs ${
              product.availability_status === 'out_of_stock'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white shadow-blue-600/20'
            }`}
            aria-label={`${t.buyFromMerchant} ${product.title}`}
          >
            {redirecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t.redirectingToMerchant}</span>
              </>
            ) : (
              <>
                <span>{compact ? t.viewDeal : t.buyFromMerchant}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
