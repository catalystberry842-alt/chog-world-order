/**
 * Shared SVG filters and patterns for the crayon look.
 * Rendered once in the root layout; referenced by id from any inline SVG.
 */
export function CrayonDefs() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute">
      <defs>
        {/* Wobbly edges plus a grainy, waxy fill. */}
        <filter id="crayon" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="4" result="wobbleNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="wobbleNoise"
            scale="2.6"
            xChannelSelector="R"
            yChannelSelector="G"
            result="wobble"
          />
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="11" result="grain" />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.3 0 0 0 1.55"
            result="grainMask"
          />
          <feComposite in="wobble" in2="grainMask" operator="in" />
        </filter>

        {/* Wobble only, for outlines that should stay solid. */}
        <filter id="crayon-line" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* Diagonal strokes that read as crayon shading. */}
        <pattern id="crayon-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="white" strokeWidth="1.4" strokeOpacity="0.28" />
        </pattern>
      </defs>
    </svg>
  );
}
