---
name: "Animation Performance"
description: "Smooth 60fps animations and transitions. Use when: optimizing CSS animations, GPU acceleration, or motion rendering."
---

# Animation Performance

Optimizing animations for smooth 60fps rendering.

## GPU-Accelerated Properties

```css
/* ✅ Fast (GPU) */
transform: translateX(100px);
opacity: 0.5;
/* ❌ Slow (CPU) */
left: 100px;
width: 50%;
```

## will-change

```css
.element {
  will-change: transform, opacity;
}
```

## Reduce Animations

```css
@media (prefers-reduced-motion) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## For Mansoni

Using framer-motion. Best practices:
- Animate only `transform` and `opacity`
- Use `layoutId` for shared layout animations
- Respect `prefers-reduced-motion`
- Avoid animating layout properties