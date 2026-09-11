import { useCallback, useSyncExternalStore } from 'react'

// Tailwind's `sm` breakpoint. The table renders a card list below it and a real
// table above it; before this hook both were always mounted and CSS hid one of
// them, so a 3000-venue list built ~6000 row components to show 3000.
const DESKTOP = '(min-width: 640px)'

export function useMediaQuery(query) {
  // Both callbacks must be stable, or useSyncExternalStore resubscribes on every
  // render and the snapshot is treated as permanently changed.
  const subscribe = useCallback(cb => {
    const mql = window.matchMedia(query)
    mql.addEventListener('change', cb)
    return () => mql.removeEventListener('change', cb)
  }, [query])
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}

export function useIsDesktop() {
  return useMediaQuery(DESKTOP)
}
