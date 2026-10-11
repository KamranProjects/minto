import { Children, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/** Adapts the supplied dock's pointer-distance magnification to native buttons. */
export function MenuDock({ children }: { children: ReactNode }) {
  const [pointer, setPointer] = useState<number | null>(null);
  return (
    <nav
      className="app-nav menu-dock"
      aria-label="Main navigation"
      onPointerMove={(event) => setPointer(event.clientX)}
      onPointerLeave={() => setPointer(null)}
    >
      <div className="menu-dock-tray">
        {Children.map(children, (child, index) => (
          <MenuDockItem key={index} pointer={pointer}>
            {child}
          </MenuDockItem>
        ))}
      </div>
    </nav>
  );
}

function MenuDockItem({
  pointer,
  children,
}: {
  pointer: number | null;
  children: ReactNode;
}) {
  const item = useRef<HTMLDivElement>(null);
  const bounds = item.current?.getBoundingClientRect();
  const distance =
    pointer !== null && bounds
      ? Math.abs(pointer - bounds.left - bounds.width / 2)
      : Infinity;
  const scale = 1 + Math.max(0, 1 - distance / 110) * 0.32;
  return (
    <div
      ref={item}
      className="menu-dock-item"
      style={{ "--icon-scale": scale } as CSSProperties}
    >
      {children}
    </div>
  );
}
