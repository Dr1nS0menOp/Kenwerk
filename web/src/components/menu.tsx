// SPDX-License-Identifier: Apache-2.0
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Link } from '../router';
import { IconChevronRight } from './icons';

const SUB_ARROW_SIZE = 16;

const ENABLED_ITEMS = '[role^=menuitem]:not(:disabled)';
const FLOATING_GAP_PX = 4;
const ENOUGH_MENU_ROOM_PX = 320;
/** How far a sub-menu that has no room beside its menu moves in, so both stay readable. */
const SUBMENU_INDENT_PX = 24;

/** The edges of something on the screen, as `getBoundingClientRect` gives them. */
export interface ScreenBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Where a sub-menu goes: beside its entry on the end side, else on the start side, else over
 * the menu a little lower and further in, as on a phone. It always stays on the screen.
 */
export function submenuPlace(
  entry: ScreenBox,
  size: { width: number; height: number },
  room: { width: number; height: number },
  rtl: boolean,
): { top: number; left: number } {
  const after = entry.right + FLOATING_GAP_PX;
  const before = entry.left - FLOATING_GAP_PX - size.width;
  const fitsAfter = after + size.width <= room.width - FLOATING_GAP_PX;
  const fitsBefore = before >= FLOATING_GAP_PX;
  const sides = rtl ? [fitsBefore && before, fitsAfter && after] : [fitsAfter && after, fitsBefore && before];
  const beside = sides.find((left): left is number => typeof left === 'number');
  const lowest = room.height - size.height - FLOATING_GAP_PX;
  if (beside !== undefined) {
    return { top: Math.max(FLOATING_GAP_PX, Math.min(entry.top, lowest)), left: beside };
  }
  const inward = rtl ? entry.right - SUBMENU_INDENT_PX - size.width : entry.left + SUBMENU_INDENT_PX;
  return {
    top: Math.max(FLOATING_GAP_PX, Math.min(entry.bottom, lowest)),
    left: Math.max(FLOATING_GAP_PX, Math.min(inward, room.width - size.width - FLOATING_GAP_PX)),
  };
}

/** Whether an entry stands elsewhere on the screen than where its sub-menu was placed beside it. */
export function entryMoved(placed: ScreenBox, now: ScreenBox): boolean {
  return placed.top !== now.top || placed.left !== now.left;
}

/** The entries of one list, without those of a sub-menu inside it. */
function itemsOf(list: Element | null): HTMLElement[] {
  if (!list) return [];
  return Array.from(list.querySelectorAll<HTMLElement>(ENABLED_ITEMS)).filter(
    (item) => item.closest('[role=menu]') === list,
  );
}

function isRightToLeft(element: Element): boolean {
  return getComputedStyle(element).direction === 'rtl';
}
/** The bars that stay in place while the page, and any menu in it, slides under them. */
export const FIXED_BARS = '.top, .edit-bar, .toolbar, .find-bar';

/** Where the free screen starts above a button. */
function freeScreenTop(anchor: DOMRect) {
  const bars = Array.from(document.querySelectorAll(FIXED_BARS), (bar) => bar.getBoundingClientRect().bottom);
  return Math.max(0, ...bars.filter((bottom) => bottom <= anchor.top));
}

/**
 * Places a list on the screen beside its button: below it when it fits or when there is no more
 * room above, else above it, never under a fixed bar, and shorter with its own scrolling when the
 * side it takes has too little room (such as the long menu of a space low in the sidebar).
 */
function placeBeside(list: HTMLElement, button: HTMLElement) {
  const anchor = button.getBoundingClientRect();
  const height = list.offsetHeight;
  const below = window.innerHeight - anchor.bottom - 2 * FLOATING_GAP_PX;
  const above = anchor.top - freeScreenTop(anchor) - 2 * FLOATING_GAP_PX;
  const staysBelow = height <= below || below >= ENOUGH_MENU_ROOM_PX || below >= above;
  const room = staysBelow ? below : above;
  const top = staysBelow
    ? anchor.bottom + FLOATING_GAP_PX
    : anchor.top - FLOATING_GAP_PX - Math.min(height, room);
  const left = Math.min(anchor.left, window.innerWidth - list.offsetWidth - FLOATING_GAP_PX);
  list.style.top = `${Math.max(top, FLOATING_GAP_PX)}px`;
  list.style.left = `${Math.max(left, FLOATING_GAP_PX)}px`;
  if (height > room) list.style.maxBlockSize = `${room}px`;
}

/**
 * How far a menu moves sideways to stay inside the window: on a phone, and in right-to-left,
 * a menu that hangs from its button's end can run past an edge.
 */
export function sidewaysShift(left: number, right: number, windowWidth: number): number {
  if (right > windowWidth - FLOATING_GAP_PX)
    return Math.max(FLOATING_GAP_PX - left, windowWidth - FLOATING_GAP_PX - right);
  if (left < FLOATING_GAP_PX) return FLOATING_GAP_PX - left;
  return 0;
}

/** A long menu stays on the screen: shorter when that leaves enough, or else above its button. */
function keepOnScreen(list: HTMLElement, button: HTMLElement) {
  const sides = list.getBoundingClientRect();
  const shift = sidewaysShift(sides.left, sides.right, window.innerWidth);
  // Moved by its own left edge, not by a transform: a transform would become the frame of the
  // sub-menus inside it, which stand on the screen.
  if (shift !== 0) {
    list.style.left = `${list.offsetLeft + shift}px`;
    list.style.right = 'auto';
  }
  const box = list.getBoundingClientRect();
  if (box.bottom <= window.innerHeight) return;
  const anchor = button.getBoundingClientRect();
  const below = window.innerHeight - box.top - FLOATING_GAP_PX;
  const above = anchor.top - freeScreenTop(anchor) - 2 * FLOATING_GAP_PX;
  const staysBelow = below >= ENOUGH_MENU_ROOM_PX || below >= above;
  list.classList.toggle('above', !staysBelow);
  list.style.maxBlockSize = `${staysBelow ? below : above}px`;
}

/** The item a key leads to: arrows, Home, End, or the next item that starts with a letter. */
function itemForKey(key: string, items: HTMLElement[], at: number): HTMLElement | undefined {
  if (key === 'ArrowDown') return items[(at + 1) % items.length];
  if (key === 'ArrowUp') return items[(at - 1 + items.length) % items.length];
  if (key === 'Home') return items[0];
  if (key === 'End') return items[items.length - 1];
  if (key.length !== 1) return undefined;
  const after = [...items.slice(at + 1), ...items.slice(0, at + 1)];
  return after.find((item) => item.textContent?.trim().toLowerCase().startsWith(key.toLowerCase()));
}

/** A dropdown menu with keyboard support: arrows, Home, End and letters move, Escape and Tab close. */
export function Menu({
  label,
  trigger,
  className,
  children,
  align = 'end',
  floating,
  opensOnDrag,
  tabIndex,
  keepOpen,
  onLeave,
}: {
  label: string;
  trigger: ReactNode;
  className?: string;
  children: ReactNode;
  align?: 'start' | 'end';
  /** For a menu inside a scrolling area, which would otherwise be cut off. */
  floating?: boolean;
  /** Holding a dragged item of this type over the button opens the menu. */
  opensOnDrag?: string;
  /** For a menu in a list with roving focus, where only one row is a Tab stop. */
  tabIndex?: number;
  /** For a menu of actions that are often repeated, such as adding three rows. */
  keepOpen?: boolean;
  /** Runs when Escape leaves the menu, for what should get the focus back. */
  onLeave?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !list.current || !button.current) return;
    if (floating) placeBeside(list.current, button.current);
    else keepOnScreen(list.current, button.current);
  }, [open, floating]);

  useEffect(() => {
    if (!open || !floating) return;
    // A fixed list would stay behind while its button scrolls away; scrolling the list itself,
    // when it is too long for the room, keeps it open.
    const close = (e: Event) => {
      if (list.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', close, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', close, { capture: true });
  }, [open, floating]);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>(ENABLED_ITEMS)?.focus();
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      button.current?.focus();
      onLeave?.();
      return;
    }
    // Each list moves among its own entries, so the arrows in a sub-menu stay inside it.
    const items = itemsOf((e.target as Element).closest('[role=menu]'));
    const target = itemForKey(e.key, items, items.indexOf(document.activeElement as HTMLElement));
    if (!target) return;
    e.preventDefault();
    target.focus();
  };

  return (
    <div className="menu" ref={root}>
      <button
        ref={button}
        type="button"
        className={className ?? 'icon'}
        tabIndex={tabIndex}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onDragEnter={(e) => {
          if (opensOnDrag && e.dataTransfer.types.includes(opensOnDrag)) setOpen(true);
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={list}
          role="menu"
          aria-label={label}
          className={floating ? 'menu-list floating' : `menu-list ${align}`}
          onKeyDown={keys}
          onClick={keepOpen ? undefined : () => setOpen(false)}
          onDrop={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" role="menuitem" {...rest}>
      {children}
    </button>
  );
}

export function MenuLink({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link href={href} role="menuitem" {...rest}>
      {children}
    </Link>
  );
}

/** A file the browser downloads, which the client-side router must leave alone. */
export function MenuDownload({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a href={href} role="menuitem" {...rest}>
      {children}
    </a>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="menu-separator" />;
}

/**
 * How a sub-menu is open: shut, shown because the pointer rests on its entry (the focus stays
 * in the menu around it), or opened on purpose with the focus on its first entry.
 */
type SubMenuState = 'shut' | 'hovered' | 'chosen';

/** How long the pointer may be away before a sub-menu it opened shuts, so it can cross the gap. */
const HOVER_LEAVE_MS = 300;

/**
 * An entry that opens a sub-menu. Resting the pointer on it shows the sub-menu; a click, Enter,
 * Space or the arrow towards the end side opens it and focuses its first entry; the arrow towards
 * the start side and Escape close it and return to the entry. Choosing an entry in it closes the
 * whole menu. The list stands on the screen, so no scrolling menu around it cuts it off.
 */
export function MenuSub({
  label,
  icon,
  className,
  children,
}: {
  label: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<SubMenuState>('shut');
  const open = state !== 'shut';
  const entry = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const leaving = useRef<number | undefined>(undefined);
  const placedBeside = useRef<ScreenBox | null>(null);

  useLayoutEffect(() => {
    const box = list.current;
    if (!open || !box || !entry.current) return;
    placedBeside.current = entry.current.getBoundingClientRect();
    const place = submenuPlace(
      placedBeside.current,
      { width: box.offsetWidth, height: box.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      isRightToLeft(entry.current),
    );
    box.style.top = `${place.top}px`;
    box.style.left = `${place.left}px`;
  }, [open]);

  useLayoutEffect(() => {
    if (state === 'chosen') itemsOf(list.current)[0]?.focus({ preventScroll: true });
  }, [state]);

  useEffect(() => () => window.clearTimeout(leaving.current), []);

  useEffect(() => {
    if (!open) return;
    // The list stands on the screen, so it would stay behind while the page scrolls. A
    // scroll inside the menu itself, such as a long menu reaching its entry, leaves it open.
    const close = (e: Event) => {
      const menu = entry.current?.closest('.menu-list');
      if (e.target instanceof Node && menu?.contains(e.target)) return;
      // A scroll reaches the page a frame after it happened, so one from before the list opened,
      // such as bringing the entry into view, arrives later. Only a scroll that moved the entry
      // leaves the list behind.
      const placed = placedBeside.current;
      if (placed && entry.current && !entryMoved(placed, entry.current.getBoundingClientRect())) return;
      setState('shut');
    };
    window.addEventListener('scroll', close, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', close, { capture: true });
  }, [open]);

  const back = () => {
    setState('shut');
    entry.current?.focus();
  };
  const towardsEnd = (key: string) =>
    key === (isRightToLeft(entry.current ?? document.body) ? 'ArrowLeft' : 'ArrowRight');
  const towardsStart = (key: string) =>
    key === (isRightToLeft(entry.current ?? document.body) ? 'ArrowRight' : 'ArrowLeft');
  // Only a mouse hovers: a touch or a pen press arrives as a click as well.
  const pointerIn = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(leaving.current);
    setState((now) => (now === 'shut' ? 'hovered' : now));
  };
  const pointerOut = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(leaving.current);
    leaving.current = window.setTimeout(() => {
      // The list goes away, so a focus inside it would fall to the page.
      if (list.current?.contains(document.activeElement)) entry.current?.focus();
      setState('shut');
    }, HOVER_LEAVE_MS);
  };

  return (
    <div className="menu-sub" onPointerEnter={pointerIn} onPointerLeave={pointerOut}>
      <button
        ref={entry}
        type="button"
        role="menuitem"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          // The menu around it closes on any click; this one only opens the sub-menu. A click on
          // a sub-menu the pointer already showed keeps it and moves into it.
          e.stopPropagation();
          setState(state === 'chosen' ? 'shut' : 'chosen');
        }}
        onKeyDown={(e) => {
          if (!towardsEnd(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          setState('chosen');
        }}
      >
        {icon}
        <span className="menu-sub-label">{label}</span>
        <span className="menu-sub-arrow">
          <IconChevronRight size={SUB_ARROW_SIZE} />
        </span>
      </button>
      {open && (
        <div
          ref={list}
          role="menu"
          aria-label={label}
          className="menu-list menu-sub-list"
          onKeyDown={(e) => {
            if (e.key === 'Escape' || towardsStart(e.key)) {
              e.preventDefault();
              e.stopPropagation();
              back();
            }
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
