/**
 * Скрытые SVG-фильтры для симуляции дальтонизма
 * Protanopia, Deuteranopia, Tritanopia
 */
export function ColorFilterSVG() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Протанопия — отсутствие красных рецепторов */}
        <filter id="protanopia">
          <feColorMatrix
            type="matrix"
            values="
              0.567, 0.433, 0,     0, 0
              0.558, 0.442, 0,     0, 0
              0,     0.242, 0.758, 0, 0
              0,     0,     0,     1, 0
            "
          />
        </filter>

        {/* Дейтеранопия — отсутствие зелёных рецепторов */}
        <filter id="deuteranopia">
          <feColorMatrix
            type="matrix"
            values="
              0.625, 0.375, 0,   0, 0
              0.700, 0.300, 0,   0, 0
              0,     0.300, 0.7, 0, 0
              0,     0,     0,   1, 0
            "
          />
        </filter>

        {/* Тританопия — отсутствие синих рецепторов */}
        <filter id="tritanopia">
          <feColorMatrix
            type="matrix"
            values="
              0.95, 0.05,  0,     0, 0
              0,    0.433, 0.567, 0, 0
              0,    0.475, 0.525, 0, 0
              0,    0,     0,     1, 0
            "
          />
        </filter>
      </defs>
    </svg>
  );
}
