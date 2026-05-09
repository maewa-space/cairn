// Tiny rendition of the Quill app icon for in-app chrome (Sidebar header,
// drawer header). Mirrors the Dock icon: solid forest squircle, cream Q.
// The Dock icon uses Playfair Display 900; in-app we use the bundled
// Newsreader at 800 — at 18-22px the contrast/letterform difference is
// imperceptible and we save a font import. Tight letter-spacing approximates
// Playfair's narrower didone proportions.

interface QuillMarkProps {
  size?: number;
  className?: string;
  /** Render as a single moss letterform without the squircle background.
   *  Useful when sitting on a colored surface (e.g. compact rail at small
   *  sizes where a tiny inner-square would just become a fleck). */
  monochrome?: boolean;
}

export function QuillMark({ size = 20, className, monochrome = false }: QuillMarkProps) {
  if (monochrome) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={className}
        aria-hidden
      >
        <text
          x="12"
          y="20"
          fontFamily="'Playfair Display', 'Newsreader', Georgia, serif"
          fontWeight={900}
          fontSize="24"
          textAnchor="middle"
          fill="currentColor"
          style={{ letterSpacing: '-0.05em' }}
        >
          Q
        </text>
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
    >
      <rect width="32" height="32" rx="7" fill="oklch(var(--moss))" />
      <text
        x="16"
        y="26"
        fontFamily="var(--font-serif)"
        fontWeight={800}
        fontSize="30"
        textAnchor="middle"
        fill="oklch(var(--surface))"
        style={{ letterSpacing: '-0.05em' }}
      >
        Q
      </text>
    </svg>
  );
}
