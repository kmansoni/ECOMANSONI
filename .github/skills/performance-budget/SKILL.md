# Skill: Performance Budget & Core Web Vitals

**Domain:** LCP, FID, CLS, bundle size, runtime optimization  
**Files:** `vite.config.ts`, `src/`, `scripts/`  
**When to apply:** New feature, third-party library addition, bundle analysis

---

## Knowledge

### Core Web Vitals (Google Search ranking signal)
- **LCP** (Largest Contentful Paint): < 2.5s (good), < 4s (needs improvement)
  - Optimize: preload key resources, remove render-blocking CSS/JS, optimize images (next-gen format), CDN
- **FID** (First Input Delay): < 100ms (good), < 300ms (needs improvement)
  - Optimize: code splitting, reduce JavaScript bundle, web worker, minimize main thread work
- **CLS** (Cumulative Layout Shift): < 0.1 (good), < 0.25 (needs improvement)
  - Optimize: reserve space for images/videos, ads, avoid dynamic content insertion above fold, font loading strategies (font-display: swap)

### Bundle Size Budgets
- **Initial JS**: < 200KB gzipped (critical rendering path)
- **Total JS (after hydration)**: < 1MB (3G)
- **CSS**: < 100KB critical, async load non-critical
- **Third-party scripts**: < 100KB each, < 300KB total
- **Images**: WebP/AVIF, responsive srcset, lazy load below fold

### Code Splitting Strategies
- **Route-based**: `React.lazy()` per page (Chat, Shop, Navigator)
- **Component-based**: heavy components (MapLibre3D, VideoEditor) → dynamic import
- **Vendor chunking**: separateReact, TanStack, MapLibre
- **Preload/prefetch**: `<link rel="preload">` for critical chunks

### Tree Shaking & Dead Code Elimination
- **ES modules**: `import { specific } from 'lib'` (not `import *`)
- **Side-effect-free**: `"sideEffects": false` in package.json
- **Unused code detection**: `webpack-bundle-analyzer`, `rollup-plugin-visualizer`
- **Babel plugins**: `transform-remove-console` (production)

### Runtime Performance
- **Long Tasks**: avoid blocking main thread > 50ms
- **Virtualization**: large lists (React Virtual, @tanstack/react-virtual)
- **Memoization**: `useMemo`, `useCallback` for expensive renders
- **Debouncing/throttling**: resize, scroll, input events

### Resource Hints
- **preconnect**: `https://api.supabase.co`
- **dns-prefetch**: third-party origins
- **preload**: critical font, above-fold image
- **prerender**: speculative (advanced)

---

## Quality Gates

| Metric | Target |
|--------|--------|
| **LCP** | < 2.5s (75th percentile) |
| **FID** | < 100ms (75th percentile) |
| **CLS** | < 0.1 (75th percentile) |
| **JS bundle (gzipped)** | < 200KB initial |
| **Time to Interactive** | < 3.5s (on fast 3G) |
| **Speed Index** | < 2.5s |

---

## When to Apply

- New third-party library (size check)
- New route/page (bundle impact analysis)
- Image optimization (format, size)
- Critical rendering path changes
- Code splitting decision points
- Build config changes (Vite/Rollup)
- Performance regression after deployment
- Field data (RUM) vs Lab data (Lighthouse)
