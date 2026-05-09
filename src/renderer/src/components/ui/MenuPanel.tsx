import { forwardRef, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { animate } from 'motion';

interface MenuPanelProps {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  testid?: string;
  role?: 'menu' | 'listbox' | 'dialog';
  ariaLabel?: string;
}

/** Editorial dropdown / popover surface. Soft 140ms fade + 4px lift on
 *  mount so menus don't snap in. Reduced-motion guard in global.css
 *  collapses the duration. Accepts a className so the call site keeps
 *  layout (absolute positioning, width, etc.); we only own the surface
 *  treatment + entry animation. */
export const MenuPanel = forwardRef<HTMLDivElement, MenuPanelProps>(
  function MenuPanel(
    { className, style, children, testid, role = 'menu', ariaLabel },
    forwardedRef,
  ) {
    const localRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const el = localRef.current;
      if (!el) return;
      animate(
        el,
        { opacity: [0, 1], y: [-4, 0] },
        { duration: 0.14, ease: [0.22, 1, 0.36, 1] },
      );
    }, []);

    return (
      <div
        ref={(node) => {
          localRef.current = node;
          if (typeof forwardedRef === 'function') {
            forwardedRef(node);
          } else if (forwardedRef) {
            (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }
        }}
        role={role}
        aria-label={ariaLabel}
        data-testid={testid}
        className={className}
        style={style}
      >
        {children}
      </div>
    );
  },
);
