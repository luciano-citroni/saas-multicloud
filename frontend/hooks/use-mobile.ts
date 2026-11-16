import * as React from "react"

const MOBILE_BREAKPOINT = 768
const LG_BREAKPOINT = 1024

function useMatchMaxWidth(maxWidthPx: number) {
  const [matches, setMatches] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${maxWidthPx - 1}px)`)
    const onChange = () => {
      setMatches(window.innerWidth < maxWidthPx)
    }
    mql.addEventListener("change", onChange)
    onChange()
    return () => mql.removeEventListener("change", onChange)
  }, [maxWidthPx])

  return !!matches
}

export function useIsMobile() {
  return useMatchMaxWidth(MOBILE_BREAKPOINT)
}

/** Viewports below Tailwind `lg` (1024) — mobile + tablet. */
export function useIsBelowLg() {
  return useMatchMaxWidth(LG_BREAKPOINT)
}
