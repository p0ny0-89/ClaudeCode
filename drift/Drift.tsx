// Drift — Invisible physics behavior layer for Framer
// Drop into a parent container to activate interactive motion on its direct child layers.
// Uses Matter.js for stable collision, resting, stacking, and rotation.

import { addPropertyControls, ControlType } from "framer"
import Matter from "matter-js"
import * as React from "react"
import { useCallback, useEffect, useRef } from "react"

const { Engine, World, Bodies, Body, Events, Vector, Composite, Runner } =
    Matter

// ─── Types ──────────────────────────────────────────────────────────────────

type BodyRole = "dynamic" | "static"

interface ManagedBody {
    el: HTMLElement
    body: Matter.Body
    role: BodyRole
    isPointerLayer: boolean
    childIndex: number // eligible child index (used for selector matching)
    homeCenter: { x: number; y: number }
    homeAngle: number
    originalTransform: string
    debugLabel?: HTMLElement // debug overlay label element
}

// ─── Canvas detection ───────────────────────────────────────────────────────

function isFramerCanvas(): boolean {
    if (typeof window === "undefined") return true
    try {
        if (window.name === "FramerCanvas" || window.name === "canvas")
            return true
        if (window.location.href.includes("/canvas")) return true
        if (
            (window as any).__FRAMER_RENDER_ENVIRONMENT__ === "CANVAS"
        )
            return true
        if (
            window.parent !== window &&
            window.parent.location.href.includes("framer.com")
        )
            return true
    } catch {
        // cross-origin → likely preview/published
    }
    return false
}

// ─── Transform parsing ─────────────────────────────────────────────────────

function parseRotation(transform: string): number {
    if (!transform || transform === "none") return 0
    const m = transform.match(
        /matrix\(\s*([^,]+),\s*([^,]+)/
    )
    if (m) return Math.atan2(parseFloat(m[2]), parseFloat(m[1]))
    const r = transform.match(/rotate\(\s*([^)]+)\)/)
    if (r) {
        const v = r[1].trim()
        return v.endsWith("rad") ? parseFloat(v) : (parseFloat(v) * Math.PI) / 180
    }
    return 0
}

// ─── Color cycle helper ─────────────────────────────────────────────────────

/** Shift element hue by 47° with a 250ms cooldown to prevent flicker */
function cycleColor(el: HTMLElement) {
    const now = Date.now()
    const last = parseFloat(el.dataset.driftHueTime || "0")
    if (now - last < 250) return
    const prev = parseFloat(el.dataset.driftHue || "0")
    const next = (prev + 47) % 360
    el.dataset.driftHue = String(next)
    el.dataset.driftHueTime = String(now)
    el.style.filter = `sepia(1) saturate(20) hue-rotate(${next}deg)`
}


// ─── DOM helpers ────────────────────────────────────────────────────────────

function findParentContainer(self: HTMLElement): HTMLElement | null {
    let el: HTMLElement | null = self.parentElement
    let depth = 0
    while (el && depth < 6) {
        if (el.children.length > 1) return el
        el = el.parentElement
        depth++
    }
    return el
}

function getLayerName(el: HTMLElement): string {
    return (
        el.getAttribute("data-framer-name") ||
        el.getAttribute("data-name") ||
        el.getAttribute("name") ||
        el.getAttribute("aria-label") ||
        el.getAttribute("id") ||
        ""
    )
}

/** Get ALL possible identifying strings for an element (for fuzzy matching) */
function getLayerIdentifiers(el: HTMLElement): string[] {
    const ids: string[] = []

    // DOM attributes (work on canvas, may be stripped in preview)
    const attrs = ["data-framer-name", "data-name", "name", "aria-label", "id"]
    for (const attr of attrs) {
        const v = el.getAttribute(attr)
        if (v) ids.push(v.toLowerCase())
    }

    // All data-* attributes (Framer sometimes adds custom data attrs)
    for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith("data-") && attr.value && attr.value.length < 60) {
            ids.push(attr.value.toLowerCase())
        }
    }

    // CSS class names (Framer generates class names, some may contain layer hints)
    if (el.className && typeof el.className === "string") {
        for (const cls of el.className.split(/\s+/)) {
            if (cls && cls.length > 2 && cls.length < 60) {
                ids.push(cls.toLowerCase())
            }
        }
    }

    // Direct text content of the element (shallow — only first 100 chars)
    const text = el.textContent?.trim()
    if (text && text.length < 100) ids.push(text.toLowerCase())

    // Also check direct child text nodes only (avoids nested container text bleed)
    let directText = ""
    for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 3 /* TEXT_NODE */) {
            directText += node.textContent || ""
        }
    }
    directText = directText.trim()
    if (directText && directText.length < 100 && directText !== text?.trim()) {
        ids.push(directText.toLowerCase())
    }

    return ids
}

interface ParsedSelector {
    type: "index" | "range" | "name"
    value: string // lowercase name, index as string, or "start-end" for range
}

/**
 * Parse a comma-separated identifier list. Supports:
 *  - "#0", "#3"      → index-based (0-indexed child position, excluding Drift itself)
 *  - "#1-#15"         → index range (inclusive)
 *  - "COLLIDER"       → name/text-based matching
 */
function parseSelectorList(input: string): ParsedSelector[] {
    if (!input || !input.trim()) return []
    return input
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
            // Range: #0-#5 or #0-5
            const rangeMatch = s.match(/^#(\d+)\s*-\s*#?(\d+)$/)
            if (rangeMatch) {
                return { type: "range" as const, value: `${rangeMatch[1]}-${rangeMatch[2]}` }
            }
            // Single index: #3
            if (s.startsWith("#") && /^#\d+$/.test(s)) {
                return { type: "index" as const, value: s.slice(1) }
            }
            return { type: "name" as const, value: s.toLowerCase() }
        })
}

function matchesSelectorList(
    el: HTMLElement,
    childIndex: number,
    selectors: ParsedSelector[]
): boolean {
    if (selectors.length === 0) return false
    const identifiers = getLayerIdentifiers(el)

    return selectors.some((sel) => {
        if (sel.type === "index") {
            return childIndex === parseInt(sel.value, 10)
        }
        if (sel.type === "range") {
            const [startStr, endStr] = sel.value.split("-")
            const start = parseInt(startStr, 10)
            const end = parseInt(endStr, 10)
            return childIndex >= start && childIndex <= end
        }
        // Name matching: check if any identifier contains the pattern
        if (identifiers.length === 0) return false
        return identifiers.some(
            (id) => id === sel.value || id.includes(sel.value)
        )
    })
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface DriftProps {
    motionMode: "zeroGravity" | "bounce" | "gravity" | "swarm"
    gravityStrength: number
    bounciness: number
    airResistance: number
    velocityCap: number
    throwStrength: number
    boundToContainer: boolean

    cursorInfluence: "off" | "nudge" | "repel" | "attract"
    cursorRadius: number
    cursorStrength: number
    dragEnabled: boolean
    throwEnabled: boolean
    returnHome: boolean
    returnStrength: number

    rotationEnabled: boolean
    angularDamping: number
    stickiness: number

    startTrigger: "immediate" | "inView" | "event"
    viewThreshold: "top" | "center" | "bottom"
    eventName: string

    defaultRole: "dynamic" | "static"
    staticColliders: string
    dynamicLayers: string
    ignoredLayers: string
    collisionEnabled: boolean
    selfCollide: boolean
    colliderPadding: number

    swarmRadius: number
    separationWeight: number
    alignmentWeight: number
    cohesionWeight: number
    swarmSpeed: number

    touchEnabled: boolean

    collisionColorCycle: boolean
    squishOnBounce: boolean

    simulationPadding: number

    debugView: boolean
    showColliderBounds: boolean

    style?: React.CSSProperties
}

const defaultProps: Required<Omit<DriftProps, "style">> = {
    motionMode: "zeroGravity",
    gravityStrength: 4,
    bounciness: 0.4,
    airResistance: 0.02,
    velocityCap: 30,
    throwStrength: 1.2,
    boundToContainer: true,
    cursorInfluence: "nudge",
    cursorRadius: 150,
    cursorStrength: 0.01,
    dragEnabled: true,
    throwEnabled: true,
    returnHome: false,
    returnStrength: 0.005,
    rotationEnabled: true,
    angularDamping: 0.05,
    stickiness: 0.3,
    startTrigger: "immediate",
    viewThreshold: "center",
    eventName: "drift-start",
    defaultRole: "dynamic",
    staticColliders: "",
    dynamicLayers: "",
    ignoredLayers: "",
    collisionEnabled: true,
    selfCollide: true,
    colliderPadding: 0,
    swarmRadius: 150,
    separationWeight: 0.6,
    alignmentWeight: 2.5,
    cohesionWeight: 1.5,
    swarmSpeed: 3,
    touchEnabled: true,
    simulationPadding: 0,
    collisionColorCycle: false,
    squishOnBounce: false,
    debugView: false,
    showColliderBounds: false,
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function Drift(props: DriftProps) {
    const p = { ...defaultProps, ...props } as Required<DriftProps>

    const selfRef = useRef<HTMLDivElement>(null)
    const engineRef = useRef<Matter.Engine | null>(null)
    const managedRef = useRef<ManagedBody[]>([])
    const wallsRef = useRef<Matter.Body[]>([])
    const parentRef = useRef<HTMLElement | null>(null)
    const rafRef = useRef<number>(0)
    const lastTimeRef = useRef(0)
    const debugOverlaysRef = useRef<HTMLElement[]>([])
    const ignoredElsRef = useRef<Set<HTMLElement>>(new Set())
    const cursorRef = useRef<{ x: number; y: number } | null>(null)
    const dragRef = useRef<{
        managed: ManagedBody
        offset: { x: number; y: number }
        history: { pos: { x: number; y: number }; time: number }[]
    } | null>(null)
    const propsRef = useRef(p)
    propsRef.current = p
    // Simulation bounds: minX/minY..maxX/maxY define the padded area;
    // visW/visH store the original visual container size for render offsets
    const boundsRef = useRef({ minX: 0, minY: 0, maxX: 0, maxY: 0, visW: 0, visH: 0 })

    // ── Build Matter.js world from DOM ──────────────────────────────────

    const init = useCallback(() => {
        const self = selfRef.current
        if (!self) return

        const parent = findParentContainer(self)
        if (!parent) return
        parentRef.current = parent

        const parentRect = parent.getBoundingClientRect()
        const W = parentRect.width
        const H = parentRect.height

        const pp = propsRef.current
        const sp = pp.simulationPadding
        boundsRef.current = { minX: -sp, minY: -sp, maxX: W + sp, maxY: H + sp, visW: W, visH: H }

        // Create engine
        const isBounce = pp.motionMode === "bounce"
        const isZeroG = pp.motionMode === "zeroGravity"
        const isSwarm = pp.motionMode === "swarm"
        const isPerpetual = isBounce || isZeroG || isSwarm // modes that need energy preservation
        const engine = Engine.create({
            gravity: {
                x: 0,
                y:
                    pp.motionMode === "gravity"
                        ? pp.gravityStrength
                        : 0,
                scale: 0.001,
            },
            // Disable sleeping in bounce mode — objects must stay in motion
            enableSleeping: !isPerpetual,
        })
        // Increase solver iterations for tighter collision resolution
        ;(engine as any).positionIterations = 10
        ;(engine as any).velocityIterations = 8
        engineRef.current = engine

        const staticSelectors = parseSelectorList(pp.staticColliders)
        const dynamicSelectors = parseSelectorList(pp.dynamicLayers)
        const ignoredSelectors = parseSelectorList(pp.ignoredLayers)
        const invertedDefault = pp.defaultRole === "static"

        const managed: ManagedBody[] = []
        const selfEls = new Set<HTMLElement>()
        let wrapper: HTMLElement | null = self
        while (wrapper && wrapper !== parent) {
            selfEls.add(wrapper)
            wrapper = wrapper.parentElement
        }

        // Build list of eligible children (excluding self) with stable indices
        const eligibleChildren: HTMLElement[] = []
        for (let i = 0; i < parent.children.length; i++) {
            const child = parent.children[i] as HTMLElement
            if (selfEls.has(child)) continue
            eligibleChildren.push(child)
        }


        for (let ci = 0; ci < eligibleChildren.length; ci++) {
            let child = eligibleChildren[ci]
            const originalChild = child // Keep reference for selector matching
            if (!child.getBoundingClientRect) continue

            let childRect = child.getBoundingClientRect()
            // Framer wraps components in display:contents divs that have 0x0 size.
            // Vector/SVG elements can be nested several levels deep.
            // Unwrap through zero-size wrappers until we find actual dimensions.
            // Check ALL children at each level, not just the first — Framer may
            // insert invisible helper divs before the visible element.
            let unwrapDepth = 0
            while (
                childRect.width === 0 &&
                childRect.height === 0 &&
                child.children.length > 0 &&
                unwrapDepth < 5
            ) {
                let found = false
                for (let k = 0; k < child.children.length; k++) {
                    const inner = child.children[k] as HTMLElement
                    if (!inner || !inner.getBoundingClientRect) continue
                    const innerRect = inner.getBoundingClientRect()
                    if (innerRect.width > 0 || innerRect.height > 0) {
                        child = inner
                        childRect = innerRect
                        found = true
                        break
                    }
                }
                if (found) break
                // All children at this level are zero — descend into the first child
                const firstChild = child.children[0] as HTMLElement
                if (!firstChild || !firstChild.getBoundingClientRect) break
                child = firstChild
                childRect = firstChild.getBoundingClientRect()
                unwrapDepth++
            }
            // SVG elements may report 0x0 from getBoundingClientRect but have
            // a viewBox or getBBox with real dimensions.
            // Also use querySelector as a last resort to find any nested SVG
            // in the original element tree.
            if (childRect.width === 0 && childRect.height === 0) {
                const searchRoot = originalChild as HTMLElement
                const svgEl =
                    child.tagName === "svg"
                        ? (child as unknown as SVGSVGElement)
                        : child.querySelector?.("svg") || searchRoot.querySelector?.("svg")
                if (svgEl) {
                    // Try getBBox for rendered SVG bounds
                    try {
                        const bbox = (svgEl as SVGSVGElement).getBBox()
                        if (bbox.width > 0 || bbox.height > 0) {
                            // Use the SVG element (or its container) with the parent-relative position
                            const svgRect = svgEl.getBoundingClientRect()
                            if (svgRect.width > 0 || svgRect.height > 0) {
                                child = svgEl as unknown as HTMLElement
                                childRect = svgRect
                            } else {
                                // SVG has internal dimensions via viewBox but no layout size;
                                // use the viewBox dimensions and the original element's position
                                const vb = svgEl.getAttribute("viewBox")
                                const vbW =
                                    parseFloat(svgEl.getAttribute("width") || "") ||
                                    (vb ? parseFloat(vb.split(/[\s,]+/)[2]) : 0)
                                const vbH =
                                    parseFloat(svgEl.getAttribute("height") || "") ||
                                    (vb ? parseFloat(vb.split(/[\s,]+/)[3]) : 0)
                                if (vbW > 0 && vbH > 0) {
                                    // Synthesize a rect using the original child's position
                                    const origRect = eligibleChildren[ci].getBoundingClientRect()
                                    childRect = {
                                        width: vbW,
                                        height: vbH,
                                        left: origRect.left,
                                        top: origRect.top,
                                        right: origRect.left + vbW,
                                        bottom: origRect.top + vbH,
                                    } as DOMRect
                                }
                            }
                        }
                    } catch {}
                }
            }
            if (childRect.width === 0 && childRect.height === 0) continue

            // Role — ci is the 0-based index among non-Drift siblings
            // Use originalChild for selector matching (it has data-framer-name etc.)
            if (matchesSelectorList(originalChild, ci, ignoredSelectors)) {
                ignoredElsRef.current.add(child)
                continue
            }

            let role: BodyRole = invertedDefault ? "static" : "dynamic"
            // Explicit overrides: staticColliders forces static, dynamicLayers forces dynamic
            if (matchesSelectorList(originalChild, ci, staticSelectors)) role = "static"
            if (matchesSelectorList(originalChild, ci, dynamicSelectors)) role = "dynamic"

            const computedTransform = getComputedStyle(child).transform
            const originalTransform =
                computedTransform && computedTransform !== "none"
                    ? computedTransform
                    : ""
            const homeAngle = parseRotation(originalTransform)

            // Use offsetWidth/Height for HTML elements, fall back to getBoundingClientRect
            // for SVG elements (which don't have offsetWidth/Height)
            const w = child.offsetWidth || childRect.width
            const h = child.offsetHeight || childRect.height
            const cx = childRect.left + childRect.width / 2 - parentRect.left
            const cy = childRect.top + childRect.height / 2 - parentRect.top

            const pad = pp.colliderPadding
            const isStatic = role === "static"

            // Collision categories: 0x0001 = statics, 0x0002 = dynamics, 0x0004 = walls
            const CATEGORY_STATIC = 0x0001
            const CATEGORY_DYNAMIC = 0x0002
            const CATEGORY_WALL = 0x0004
            // In perpetual modes, dynamics don't collide with walls (handled manually)
            const dynamicMask = isPerpetual
                ? (pp.selfCollide ? CATEGORY_STATIC | CATEGORY_DYNAMIC : CATEGORY_STATIC)
                : (pp.selfCollide ? CATEGORY_STATIC | CATEGORY_DYNAMIC | CATEGORY_WALL : CATEGORY_STATIC | CATEGORY_WALL)
            const collisionFilter = isStatic
                ? { category: CATEGORY_STATIC, mask: 0xFFFF }
                : { category: CATEGORY_DYNAMIC, mask: dynamicMask }

            const matterBody = Bodies.rectangle(cx, cy, w + pad * 2, h + pad * 2, {
                angle: homeAngle,
                isStatic,
                // Bounce: near-perfect elasticity, minimal friction
                // Zero gravity: perfect elasticity, zero friction
                // Gravity: user-controlled
                restitution: isPerpetual ? 1.0 : pp.bounciness,
                friction: isPerpetual ? 0 : pp.stickiness * 1.0,
                frictionStatic: isPerpetual ? 0 : pp.stickiness * 2.0,
                frictionAir: isPerpetual ? 0 : pp.airResistance,
                density: 0.001,
                slop: 0.005,
                sleepThreshold: isPerpetual ? Infinity : 30,
                label: getLayerName(originalChild) || getLayerName(child) || `body-${ci}`,
                collisionFilter,
            })

            if (!pp.rotationEnabled && !isStatic) {
                Body.setInertia(matterBody, Infinity)
            }

            Composite.add(engine.world, matterBody)

            // Auto-detect linked elements: <a> tags, elements containing <a>,
            // or Framer link attributes — these get pointer cursor and skip drag
            const hasLink =
                originalChild.tagName === "A" ||
                child.tagName === "A" ||
                !!originalChild.querySelector?.("a[href]") ||
                !!child.querySelector?.("a[href]") ||
                originalChild.hasAttribute("data-framer-page-link-current")

            const isPointerLayer = hasLink

            // display:contents elements cannot be transformed — CSS translate/rotate
            // has no visual effect on them. Find the first child with a real box model
            // to use as the transform target instead.
            let transformEl = child
            if (getComputedStyle(child).display === "contents" && child.children.length > 0) {
                for (let k = 0; k < child.children.length; k++) {
                    const candidate = child.children[k] as HTMLElement
                    if (!candidate.getBoundingClientRect) continue
                    const cRect = candidate.getBoundingClientRect()
                    if (cRect.width > 0 || cRect.height > 0) {
                        transformEl = candidate
                        break
                    }
                }
            }

            managed.push({
                el: transformEl,
                body: matterBody,
                role,
                isPointerLayer,
                childIndex: ci,
                homeCenter: { x: cx, y: cy },
                homeAngle,
                originalTransform,
            })
        }

        managedRef.current = managed

        // Set cursor on dynamic elements and prevent native browser drag
        for (const m of managed) {
            if (m.role !== "dynamic") continue
            if (m.isPointerLayer) {
                m.el.style.cursor = "pointer"
            } else if (pp.dragEnabled) {
                m.el.style.cursor = "grab"
            }
            // Prevent native HTML drag (ghost image / blocked cursor icon)
            m.el.setAttribute("draggable", "false")
            m.el.addEventListener("dragstart", (e) => e.preventDefault(), { once: false })
        }

        // Debug: visual index labels + console log
        if (pp.debugView) {
            console.log(
                "[Drift] Detected layers:",
                managed.map((m) => ({
                    index: `#${m.childIndex}`,
                    name: getLayerName(m.el) || "(unnamed)",
                    identifiers: getLayerIdentifiers(m.el),
                    role: m.role,
                    size: `${Math.round(m.body.bounds.max.x - m.body.bounds.min.x)}×${Math.round(m.body.bounds.max.y - m.body.bounds.min.y)}`,
                    isStatic: m.body.isStatic,
                }))
            )
            console.log(
                "[Drift] Tip: Use #0, #1, etc. in Static Colliders / Ignored fields to select layers by index."
            )

            // Add visual index labels overlaid on parent (avoids child overflow:hidden clipping)
            // Labels show the ELIGIBLE CHILD index (ci) — use this in selector fields
            const parentPos = getComputedStyle(parent).position
            if (parentPos === "static") parent.style.position = "relative"

            for (let idx = 0; idx < managed.length; idx++) {
                const m = managed[idx]
                const childRect = m.el.getBoundingClientRect()
                const parentRect2 = parent.getBoundingClientRect()
                const offsetX = childRect.left - parentRect2.left
                const offsetY = childRect.top - parentRect2.top

                const roleSuffix = m.role === "static" ? " S" : m.isPointerLayer ? " L" : " D"
                const label = document.createElement("div")
                label.textContent = `#${m.childIndex}${roleSuffix}`
                label.setAttribute("data-drift-debug", "true")
                Object.assign(label.style, {
                    position: "absolute",
                    top: `${offsetY + 4}px`,
                    left: `${offsetX + 4}px`,
                    background: m.role === "static" ? "#ff6600" : "#0088ff",
                    color: "#fff",
                    fontSize: "11px",
                    fontFamily: "monospace",
                    fontWeight: "bold",
                    padding: "2px 5px",
                    borderRadius: "3px",
                    zIndex: "99999",
                    pointerEvents: "none",
                    lineHeight: "1.2",
                    whiteSpace: "nowrap",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                })
                parent.appendChild(label)
                debugOverlaysRef.current.push(label)
                m.debugLabel = label

                // Also add a colored border to the element itself
                const color = m.role === "static" ? "rgba(255, 102, 0, 0.8)" : "rgba(0, 136, 255, 0.8)"
                m.el.style.outline = `2px solid ${color}`
                m.el.style.outlineOffset = "-2px"
            }
        }

        // Show Bounds: add colored outlines to collider bodies (independent of debugView)
        if (pp.showColliderBounds && !pp.debugView) {
            for (const m of managed) {
                const outline =
                    m.role === "static"
                        ? "2px solid rgba(255, 102, 0, 0.7)"
                        : "2px solid rgba(0, 136, 255, 0.7)"
                m.el.style.outline = outline
                m.el.style.outlineOffset = "-2px"
            }
        }

        // Container walls (if bounded) — expanded by simulationPadding
        if (pp.boundToContainer) {
            const wallThickness = 60
            const simW = W + sp * 2 // padded simulation width
            const simH = H + sp * 2 // padded simulation height
            const simCx = W / 2     // center X stays at visual center
            const simCy = H / 2     // center Y stays at visual center
            const walls = [
                // top
                Bodies.rectangle(simCx, -sp - wallThickness / 2, simW + wallThickness * 2, wallThickness, { isStatic: true, label: "wall-top" }),
                // bottom
                Bodies.rectangle(simCx, H + sp + wallThickness / 2, simW + wallThickness * 2, wallThickness, { isStatic: true, label: "wall-bottom" }),
                // left
                Bodies.rectangle(-sp - wallThickness / 2, simCy, wallThickness, simH + wallThickness * 2, { isStatic: true, label: "wall-left" }),
                // right
                Bodies.rectangle(W + sp + wallThickness / 2, simCy, wallThickness, simH + wallThickness * 2, { isStatic: true, label: "wall-right" }),
            ]
            for (const w of walls) {
                w.restitution = isPerpetual ? 1.0 : pp.bounciness
                w.friction = isPerpetual ? 0 : pp.stickiness * 1.0
                w.frictionStatic = 0
                // Walls use CATEGORY_WALL so perpetual-mode dynamics can ignore them
                w.collisionFilter = { category: 0x0004, mask: 0xFFFF }
            }
            Composite.add(engine.world, walls)
            wallsRef.current = walls
        }

        // Collision events and squish effect
        Events.on(engine, "collisionStart", (event: any) => {
            for (const pair of event.pairs) {
                const labelA = pair.bodyA.label || ""
                const labelB = pair.bodyB.label || ""
                const isWallA = labelA.startsWith("wall-")
                const isWallB = labelB.startsWith("wall-")

                // Wall bounce (gravity mode only — perpetual uses manual bounce)
                if ((isWallA || isWallB) && !isPerpetual) {
                    const dynamicBody = isWallA ? pair.bodyB : pair.bodyA
                    const wallDir = (isWallA ? labelA : labelB).replace("wall-", "")
                    const m = managedRef.current.find(mb => mb.body === dynamicBody)
                    if (!m || m.role === "static") continue

                    if (pp.collisionColorCycle) cycleColor(m.el)

                    if (pp.squishOnBounce) {
                        const isH = wallDir === "top" || wallDir === "bottom"
                        const sx = isH ? 1.25 : 0.75, sy = isH ? 0.75 : 1.25
                        m.el.style.transition = "scale 0.08s ease-in"
                        m.el.style.scale = `${sx} ${sy}`
                        setTimeout(() => { m.el.style.transition = "scale 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)"; m.el.style.scale = "1 1" }, 80)
                        setTimeout(() => { m.el.style.transition = ""; m.el.style.scale = "" }, 350)
                    }

                    window.dispatchEvent(new CustomEvent("drift-wall-bounce", {
                        detail: { wall: wallDir, bodyLabel: dynamicBody.label, element: m.el },
                    }))
                }

                // Body-to-body collisions
                if (!isWallA && !isWallB) {
                    for (const b of [pair.bodyA, pair.bodyB]) {
                        const m = managedRef.current.find(mb => mb.body === b)
                        if (!m || m.role === "static") continue

                        if (pp.collisionColorCycle) {
                            const prev = parseFloat(m.el.dataset.driftHue || "0")
                            const next = (prev + 47) % 360
                            m.el.dataset.driftHue = String(next)
                            m.el.style.filter = `sepia(1) saturate(20) hue-rotate(${next}deg)`
                        }

                        if (pp.squishOnBounce) {
                            m.el.style.transition = "scale 0.06s ease-in"
                            m.el.style.scale = "0.85 0.85"
                            setTimeout(() => { m.el.style.transition = "scale 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)"; m.el.style.scale = "1 1" }, 60)
                            setTimeout(() => { m.el.style.transition = ""; m.el.style.scale = "" }, 280)
                        }
                    }
                }
            }
        })

        // Apply initial motion for zero-gravity and bounce modes
        for (const m of managed) {
            if (m.role === "static") continue
            if (pp.motionMode === "zeroGravity") {
                const angle = Math.random() * Math.PI * 2
                const speed = 1 + Math.random() * 2
                Body.setVelocity(m.body, {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed,
                })
                if (pp.rotationEnabled) {
                    Body.setAngularVelocity(m.body, (Math.random() - 0.5) * 0.02)
                }
            } else if (pp.motionMode === "bounce") {
                const angle = Math.random() * Math.PI * 2
                const speed = 3 + Math.random() * 5
                Body.setVelocity(m.body, {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed,
                })
                if (pp.rotationEnabled) {
                    Body.setAngularVelocity(m.body, (Math.random() - 0.5) * 0.04)
                }
            } else if (pp.motionMode === "swarm") {
                const angle = Math.random() * Math.PI * 2
                const speed = pp.swarmSpeed * (0.8 + Math.random() * 0.4)
                Body.setVelocity(m.body, {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed,
                })
            }
        }

    }, [])

    // ── Animation loop ──────────────────────────────────────────────────

    const FIXED_DT = 1000 / 60 // ~16.67ms — constant for stable physics

    const animate = useCallback((time: number) => {
        const engine = engineRef.current
        if (!engine) return
        if (pausedRef.current) return

        const pp = propsRef.current
        const managed = managedRef.current
        const cursor = cursorRef.current
        const drag = dragRef.current
        const bounds = boundsRef.current

        // Handle drag: move body to cursor each frame
        if (drag) {
            Body.setPosition(drag.managed.body, {
                x: (cursor?.x ?? drag.managed.body.position.x) - drag.offset.x,
                y: (cursor?.y ?? drag.managed.body.position.y) - drag.offset.y,
            })
            Body.setVelocity(drag.managed.body, { x: 0, y: 0 })
            Body.setAngularVelocity(drag.managed.body, 0)

            // Wake nearby sleeping bodies so stacked objects fall when
            // the support beneath them is dragged away
            const db = drag.managed.body.bounds
            const wakePad = 10
            for (const m of managed) {
                if (m.body === drag.managed.body) continue
                if (!m.body.isSleeping) continue
                const mb = m.body.bounds
                if (mb.max.x > db.min.x - wakePad && mb.min.x < db.max.x + wakePad &&
                    mb.max.y > db.min.y - wakePad && mb.min.y < db.max.y + wakePad) {
                    Matter.Sleeping.set(m.body, false)
                }
            }
        }

        // Cursor forces on non-dragged bodies
        if (cursor && pp.cursorInfluence !== "off") {
            for (const m of managed) {
                if (m.role === "static") continue
                if (m.body.isStatic) continue
                if (drag && drag.managed === m) continue

                const dx = m.body.position.x - cursor.x
                const dy = m.body.position.y - cursor.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                if (dist < pp.cursorRadius && dist > 1) {
                    // Wake sleeping bodies so they respond to cursor
                    if (m.body.isSleeping) Matter.Sleeping.set(m.body, false)
                    const strength = pp.cursorStrength * (1 - dist / pp.cursorRadius)
                    const nx = dx / dist
                    const ny = dy / dist

                    let fx = 0
                    let fy = 0
                    switch (pp.cursorInfluence) {
                        case "nudge":
                            fx = nx * strength * 0.5
                            fy = ny * strength * 0.5
                            break
                        case "repel":
                            fx = nx * strength
                            fy = ny * strength
                            break
                        case "attract": {
                            // Dead zone: once very close to cursor, stop applying force
                            // and gently brake to a stop. Prevents jitter/oscillation.
                            const deadZone = 8
                            if (dist < deadZone) {
                                // Inside dead zone — just brake hard so it settles
                                Body.setVelocity(m.body, {
                                    x: m.body.velocity.x * 0.5,
                                    y: m.body.velocity.y * 0.5,
                                })
                            } else {
                                // Attract force ramps down smoothly as object nears cursor
                                const attractRange = pp.cursorRadius - deadZone
                                const normalizedDist = (dist - deadZone) / attractRange
                                // Quadratic falloff: stronger pull when far, gentle when close
                                const attractStrength = pp.cursorStrength * normalizedDist * normalizedDist
                                fx = -nx * attractStrength
                                fy = -ny * attractStrength
                                // Progressive damping: brake harder as object approaches
                                const damping = 0.92 - (1 - normalizedDist) * 0.25
                                Body.setVelocity(m.body, {
                                    x: m.body.velocity.x * damping,
                                    y: m.body.velocity.y * damping,
                                })
                            }
                            break
                        }
                    }
                    Body.applyForce(m.body, m.body.position, { x: fx, y: fy })
                }
            }
        }

        // Return-home: soft spring + velocity steering for organic feel
        if (pp.returnHome) {
            for (const m of managed) {
                if (m.role === "static") continue
                if (m.body.isStatic) continue
                if (drag && drag.managed === m) continue

                const dx = m.homeCenter.x - m.body.position.x
                const dy = m.homeCenter.y - m.body.position.y
                const dist = Math.sqrt(dx * dx + dy * dy)
                const speed = m.body.speed

                // Snap to exact home when close and slow
                if (dist < 6 && speed < 0.5) {
                    Body.setPosition(m.body, { x: m.homeCenter.x, y: m.homeCenter.y })
                    Body.setVelocity(m.body, { x: 0, y: 0 })
                    if (pp.rotationEnabled) {
                        Body.setAngle(m.body, m.homeAngle)
                        Body.setAngularVelocity(m.body, 0)
                    }
                    continue
                }

                // Gentle spring force — constant multiplier, let returnStrength control feel
                Body.applyForce(m.body, m.body.position, {
                    x: dx * pp.returnStrength * m.body.mass * 0.001,
                    y: dy * pp.returnStrength * m.body.mass * 0.001,
                })

                // Velocity steering: instead of braking, gently blend velocity
                // toward the home direction. This feels like a soft current pulling
                // the body home rather than a stiff spring.
                if (dist > 0.1) {
                    const nx = dx / dist  // unit vector toward home
                    const ny = dy / dist
                    const vx = m.body.velocity.x
                    const vy = m.body.velocity.y

                    // How much of current velocity is already going home?
                    const dot = vx * nx + vy * ny
                    // Blend factor: steer more as body gets closer
                    const steer = Math.min(0.08, 3 / (dist + 30))

                    Body.setVelocity(m.body, {
                        x: vx + (nx * Math.max(dot, 0.5) - vx) * steer,
                        y: vy + (ny * Math.max(dot, 0.5) - vy) * steer,
                    })
                }

                if (pp.rotationEnabled) {
                    const angleDiff = m.homeAngle - m.body.angle
                    Body.setAngularVelocity(
                        m.body,
                        m.body.angularVelocity + angleDiff * pp.returnStrength * 0.3
                    )
                }
            }
        }

        // ── Swarm / Boid forces ────────────────────────────────────────
        if (pp.motionMode === "swarm") {
            const dynamics = managed.filter(m => m.role !== "static" && !m.body.isStatic && !(drag && drag.managed === m))
            const r = pp.swarmRadius
            const rSq = r * r
            const maxForce = 0.003

            // Minimum separation distance — prevents force spikes when bodies overlap
            const minSepDist = 20

            for (const m of dynamics) {
                let sepX = 0, sepY = 0
                let aliVx = 0, aliVy = 0
                let cohX = 0, cohY = 0
                let neighbors = 0

                for (const n of dynamics) {
                    if (n === m) continue
                    const dx = m.body.position.x - n.body.position.x
                    const dy = m.body.position.y - n.body.position.y
                    const dSq = dx * dx + dy * dy
                    if (dSq > rSq || dSq < 0.01) continue

                    const dist = Math.max(Math.sqrt(dSq), minSepDist)
                    neighbors++

                    // Separation: capped inverse distance (linear falloff, not 1/d²)
                    sepX += (dx / dist) * (1 - dist / r)
                    sepY += (dy / dist) * (1 - dist / r)

                    // Alignment: accumulate neighbor velocities
                    aliVx += n.body.velocity.x
                    aliVy += n.body.velocity.y

                    // Cohesion: accumulate neighbor positions
                    cohX += n.body.position.x
                    cohY += n.body.position.y
                }

                let fx = 0, fy = 0
                const mass = m.body.mass

                if (neighbors > 0) {
                    // Separation steer — scale by mass so small bodies aren't flung
                    const sepLen = Math.sqrt(sepX * sepX + sepY * sepY)
                    if (sepLen > 0) {
                        fx += (sepX / sepLen) * pp.separationWeight * maxForce * mass
                        fy += (sepY / sepLen) * pp.separationWeight * maxForce * mass
                    }

                    // Alignment steer (toward average heading)
                    aliVx /= neighbors; aliVy /= neighbors
                    const aSteerX = aliVx - m.body.velocity.x
                    const aSteerY = aliVy - m.body.velocity.y
                    const aLen = Math.sqrt(aSteerX * aSteerX + aSteerY * aSteerY)
                    if (aLen > 0) {
                        fx += (aSteerX / aLen) * pp.alignmentWeight * maxForce * mass
                        fy += (aSteerY / aLen) * pp.alignmentWeight * maxForce * mass
                    }

                    // Cohesion steer (toward average position)
                    cohX /= neighbors; cohY /= neighbors
                    const cDx = cohX - m.body.position.x
                    const cDy = cohY - m.body.position.y
                    const cLen = Math.sqrt(cDx * cDx + cDy * cDy)
                    if (cLen > 0) {
                        fx += (cDx / cLen) * pp.cohesionWeight * maxForce * mass
                        fy += (cDy / cLen) * pp.cohesionWeight * maxForce * mass
                    }
                }

                // Soft boundary steering — steer inward when near edges
                if (pp.boundToContainer && bounds.visW > 0) {
                    const margin = r * 0.6
                    const pos = m.body.position
                    const bw = (m.body.bounds.max.x - m.body.bounds.min.x) / 2
                    const bh = (m.body.bounds.max.y - m.body.bounds.min.y) / 2
                    const bf = maxForce * 2 * mass
                    if (pos.x - bw < bounds.minX + margin) fx += bf * Math.max(0, 1 - (pos.x - bw - bounds.minX) / margin)
                    if (pos.x + bw > bounds.maxX - margin) fx -= bf * Math.max(0, 1 - (bounds.maxX - pos.x - bw) / margin)
                    if (pos.y - bh < bounds.minY + margin) fy += bf * Math.max(0, 1 - (pos.y - bh - bounds.minY) / margin)
                    if (pos.y + bh > bounds.maxY - margin) fy -= bf * Math.max(0, 1 - (bounds.maxY - pos.y - bh) / margin)
                }

                // Speed regulation: steer toward swarmSpeed so flock keeps moving
                const speed = Math.sqrt(m.body.velocity.x ** 2 + m.body.velocity.y ** 2)
                if (speed > 0.1) {
                    const target = pp.swarmSpeed
                    const correction = (target - speed) / speed * 0.03
                    fx += m.body.velocity.x * correction * mass
                    fy += m.body.velocity.y * correction * mass
                } else {
                    // Kickstart stalled bodies with a random direction
                    const angle = Math.random() * Math.PI * 2
                    fx += Math.cos(angle) * maxForce * mass * 2
                    fy += Math.sin(angle) * maxForce * mass * 2
                }

                // Clamp total force relative to mass
                const fLen = Math.sqrt(fx * fx + fy * fy)
                const fCap = maxForce * 4 * mass
                if (fLen > fCap) {
                    fx = (fx / fLen) * fCap
                    fy = (fy / fLen) * fCap
                }

                Body.applyForce(m.body, m.body.position, { x: fx, y: fy })
            }
        }

        // ── Live collider sync ──────────────────────────────────────────
        // Sync static colliders to their live DOM bounds every frame so hover
        // animations that resize them physically push dynamic bodies.
        const parent = parentRef.current
        if (parent) {
            const parentRect = parent.getBoundingClientRect()
            for (const m of managed) {
                if (m.role !== "static") continue

                const rect = m.el.getBoundingClientRect()
                const newW = rect.width
                const newH = rect.height
                const newCx = rect.left + newW / 2 - parentRect.left
                const newCy = rect.top + newH / 2 - parentRect.top

                // Track movement for velocity-based push
                const prevCx = m.body.position.x
                const prevCy = m.body.position.y
                const velX = newCx - prevCx
                const velY = newCy - prevCy

                const pad = pp.colliderPadding
                const targetW = newW + pad * 2
                const targetH = newH + pad * 2
                const oldW = m.body.bounds.max.x - m.body.bounds.min.x
                const oldH = m.body.bounds.max.y - m.body.bounds.min.y

                const sizeChanged = Math.abs(targetW - oldW) > 1 || Math.abs(targetH - oldH) > 1
                const posChanged = Math.abs(velX) > 0.5 || Math.abs(velY) > 0.5

                if (sizeChanged) {
                    // Size changed — rebuild vertices at exact positions.
                    // IMPORTANT: setPosition FIRST, then setVertices.
                    // setVertices places verts at world coordinates; calling
                    // setPosition after would translate them again (double-offset).
                    const hw = targetW / 2
                    const hh = targetH / 2
                    const angle = m.body.angle
                    const cos = Math.cos(angle)
                    const sin = Math.sin(angle)

                    Body.setPosition(m.body, { x: newCx, y: newCy })

                    const verts = [
                        { x: newCx + (-hw * cos - -hh * sin), y: newCy + (-hw * sin + -hh * cos) },
                        { x: newCx + ( hw * cos - -hh * sin), y: newCy + ( hw * sin + -hh * cos) },
                        { x: newCx + ( hw * cos -  hh * sin), y: newCy + ( hw * sin +  hh * cos) },
                        { x: newCx + (-hw * cos -  hh * sin), y: newCy + (-hw * sin +  hh * cos) },
                    ]
                    Body.setVertices(m.body, verts)
                    Body.setVelocity(m.body, { x: velX, y: velY })

                    // Actively push overlapping dynamic bodies out
                    for (const other of managed) {
                        if (other === m || other.body.isStatic) continue
                        const ob = other.body
                        const dx = ob.position.x - newCx
                        const dy = ob.position.y - newCy

                        const localX = dx * cos + dy * sin
                        const localY = -dx * sin + dy * cos
                        const obHw = (ob.bounds.max.x - ob.bounds.min.x) / 2
                        const obHh = (ob.bounds.max.y - ob.bounds.min.y) / 2

                        const overlapX = hw + obHw - Math.abs(localX)
                        const overlapY = hh + obHh - Math.abs(localY)

                        if (overlapX > 0 && overlapY > 0) {
                            Matter.Sleeping.set(ob, false)
                            // Push along axis of least penetration
                            if (overlapY < overlapX) {
                                const pushDir = localY > 0 ? 1 : -1
                                const pushDist = overlapY + 2
                                Body.setPosition(ob, {
                                    x: ob.position.x + (-sin * pushDir * pushDist),
                                    y: ob.position.y + (cos * pushDir * pushDist),
                                })
                            } else {
                                const pushDir = localX > 0 ? 1 : -1
                                const pushDist = overlapX + 2
                                Body.setPosition(ob, {
                                    x: ob.position.x + (cos * pushDir * pushDist),
                                    y: ob.position.y + (sin * pushDir * pushDist),
                                })
                            }
                            Body.setVelocity(ob, {
                                x: ob.velocity.x + velX * 0.8,
                                y: ob.velocity.y + velY * 0.8,
                            })
                        } else {
                            const dist = Math.sqrt(dx * dx + dy * dy)
                            if (dist < Math.max(hw, hh) * 2 + 80) {
                                Matter.Sleeping.set(ob, false)
                            }
                        }
                    }
                } else if (posChanged) {
                    // Only position changed — just move, no vertex rebuild
                    Body.setPosition(m.body, { x: newCx, y: newCy })
                    Body.setVelocity(m.body, { x: velX, y: velY })
                }
            }
        }

        // Pre-step: cap velocity to prevent runaway buildup from forces
        for (const m of managed) {
            if (m.body.isStatic) continue
            const v = m.body.velocity
            const speed = Math.sqrt(v.x * v.x + v.y * v.y)
            if (speed > pp.velocityCap) {
                const s = pp.velocityCap / speed
                Body.setVelocity(m.body, { x: v.x * s, y: v.y * s })
            }
        }

        // Step the engine with FIXED timestep for stability
        Engine.update(engine, FIXED_DT)

        // Post-step: safety net only — allow bounce rebounds up to 2x the cap,
        // only clamp truly extreme spikes from collision glitches
        const hardCap = pp.velocityCap * 2
        for (const m of managed) {
            if (m.body.isStatic) continue

            const v = m.body.velocity
            const speed = Math.sqrt(v.x * v.x + v.y * v.y)
            if (speed > hardCap) {
                const s = hardCap / speed
                Body.setVelocity(m.body, { x: v.x * s, y: v.y * s })
            }

            // Angular velocity cap
            const maxAngVel = 0.3
            if (Math.abs(m.body.angularVelocity) > maxAngVel) {
                Body.setAngularVelocity(
                    m.body,
                    Math.sign(m.body.angularVelocity) * maxAngVel
                )
            }

            // Bounds safety — if a body escapes the container, pull it back (gravity mode only)
            const isPerpetualMode = pp.motionMode === "bounce" || pp.motionMode === "zeroGravity" || pp.motionMode === "swarm"
            if (pp.boundToContainer && bounds.visW > 0 && !isPerpetualMode) {
                const pos = m.body.position
                const margin = 50
                let clamped = false
                let nx = pos.x
                let ny = pos.y

                if (pos.x < bounds.minX - margin) { nx = bounds.minX + 10; clamped = true }
                if (pos.x > bounds.maxX + margin) { nx = bounds.maxX - 10; clamped = true }
                if (pos.y < bounds.minY - margin) { ny = bounds.minY + 10; clamped = true }
                if (pos.y > bounds.maxY + margin) { ny = bounds.maxY - 10; clamped = true }

                if (clamped) {
                    Body.setPosition(m.body, { x: nx, y: ny })
                    Body.setVelocity(m.body, { x: 0, y: 0 })
                    Body.setAngularVelocity(m.body, 0)
                }
            }
        }

        // Perpetual modes: manual wall bouncing (dynamics bypass Matter.js walls)
        if ((pp.motionMode === "bounce" || pp.motionMode === "zeroGravity") && pp.boundToContainer && bounds.visW > 0) {
            const minSpeed = pp.motionMode === "bounce" ? 1.5 : 2.0
            for (const m of managed) {
                if (m.body.isStatic) continue
                if (drag && drag.managed === m) continue

                const pos = m.body.position
                const v = m.body.velocity
                const bw = (m.body.bounds.max.x - m.body.bounds.min.x) / 2
                const bh = (m.body.bounds.max.y - m.body.bounds.min.y) / 2
                let vx = v.x, vy = v.y
                let px = pos.x, py = pos.y
                let bounced = false
                let wallHit = ""

                // Left wall
                if (px - bw <= bounds.minX) { px = bounds.minX + bw + 1; vx = Math.abs(vx) || minSpeed; bounced = true; wallHit = "left" }
                // Right wall
                else if (px + bw >= bounds.maxX) { px = bounds.maxX - bw - 1; vx = -Math.abs(vx) || -minSpeed; bounced = true; wallHit = "right" }
                // Top wall
                if (py - bh <= bounds.minY) { py = bounds.minY + bh + 1; vy = Math.abs(vy) || minSpeed; bounced = true; wallHit = "top" }
                // Bottom wall
                else if (py + bh >= bounds.maxY) { py = bounds.maxY - bh - 1; vy = -Math.abs(vy) || -minSpeed; bounced = true; wallHit = "bottom" }

                if (bounced) {
                    Body.setPosition(m.body, { x: px, y: py })
                    Body.setVelocity(m.body, { x: vx, y: vy })

                    // Color cycle on wall bounce
                    if (pp.collisionColorCycle) cycleColor(m.el)

                    // Squish on bounce — squash in impact axis, stretch perpendicular
                    if (pp.squishOnBounce) {
                        const isHorizontalWall = wallHit === "top" || wallHit === "bottom"
                        const sx = isHorizontalWall ? 1.25 : 0.75
                        const sy = isHorizontalWall ? 0.75 : 1.25
                        m.el.style.transition = "scale 0.08s ease-in"
                        m.el.style.scale = `${sx} ${sy}`
                        // Spring back
                        setTimeout(() => {
                            m.el.style.transition = "scale 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)"
                            m.el.style.scale = "1 1"
                        }, 80)
                        // Clean up transition
                        setTimeout(() => {
                            m.el.style.transition = ""
                            m.el.style.scale = ""
                        }, 350)
                    }

                    // Dispatch wall bounce event
                    window.dispatchEvent(new CustomEvent("drift-wall-bounce", {
                        detail: { wall: wallHit, bodyLabel: m.body.label, element: m.el },
                    }))
                }

                // Ensure minimum speed
                const speed = Math.sqrt(vx * vx + vy * vy)
                if (speed < minSpeed) {
                    const angle = speed > 0.1
                        ? Math.atan2(vy, vx) + (Math.random() - 0.5) * 0.3
                        : Math.random() * Math.PI * 2
                    Body.setVelocity(m.body, {
                        x: Math.cos(angle) * minSpeed,
                        y: Math.sin(angle) * minSpeed,
                    })
                }
            }
        }

        // Swarm: hard boundary safety net — reflect if soft steering wasn't enough
        if (pp.motionMode === "swarm" && pp.boundToContainer && bounds.visW > 0) {
            for (const m of managed) {
                if (m.body.isStatic) continue
                const pos = m.body.position
                const v = m.body.velocity
                const bw = (m.body.bounds.max.x - m.body.bounds.min.x) / 2
                const bh = (m.body.bounds.max.y - m.body.bounds.min.y) / 2
                let px = pos.x, py = pos.y, vx = v.x, vy = v.y, fix = false
                if (px - bw < bounds.minX) { px = bounds.minX + bw + 1; vx = Math.abs(vx); fix = true }
                else if (px + bw > bounds.maxX) { px = bounds.maxX - bw - 1; vx = -Math.abs(vx); fix = true }
                if (py - bh < bounds.minY) { py = bounds.minY + bh + 1; vy = Math.abs(vy); fix = true }
                else if (py + bh > bounds.maxY) { py = bounds.maxY - bh - 1; vy = -Math.abs(vy); fix = true }
                if (fix) {
                    Body.setPosition(m.body, { x: px, y: py })
                    Body.setVelocity(m.body, { x: vx, y: vy })
                }
            }
        }

        // Sync physics to DOM using individual CSS transform properties.
        // This leaves el.style.transform free for Framer's hover variants
        // (scale, skew, etc.) to work without being overwritten.
        for (const m of managed) {
            if (m.role === "static") continue

            const dx = Math.round((m.body.position.x - m.homeCenter.x) * 100) / 100
            const dy = Math.round((m.body.position.y - m.homeCenter.y) * 100) / 100

            m.el.style.translate = `${dx}px ${dy}px`

            if (pp.rotationEnabled) {
                const dAngle = m.body.angle - m.homeAngle
                const dAngleDeg = Math.round((dAngle * 180) / Math.PI * 100) / 100
                m.el.style.rotate = `${dAngleDeg}deg`
            }

            m.el.style.willChange = "translate, rotate"

            // Update debug label position to follow the body
            if (m.debugLabel) {
                const bw = m.body.bounds.max.x - m.body.bounds.min.x
                const bh = m.body.bounds.max.y - m.body.bounds.min.y
                m.debugLabel.style.top = `${m.body.position.y - bh / 2 + 4}px`
                m.debugLabel.style.left = `${m.body.position.x - bw / 2 + 4}px`
            }
        }


        rafRef.current = requestAnimationFrame(animate)
    }, [])

    // ── Pointer events ──────────────────────────────────────────────────

    const handlePointerDown = useCallback((e: PointerEvent) => {
        // Touch input is handled entirely by touch event handlers below
        if (e.pointerType === "touch") return
        const pp = propsRef.current
        if (!pp.dragEnabled && pp.cursorInfluence === "off") return
        const parent = parentRef.current
        if (!parent) return

        // If the click target is inside an ignored element, don't interfere
        const target = e.target as HTMLElement
        for (const ignoredEl of ignoredElsRef.current) {
            if (ignoredEl === target || ignoredEl.contains(target)) return
        }

        const parentRect = parent.getBoundingClientRect()
        const px = e.clientX - parentRect.left
        const py = e.clientY - parentRect.top

        // Hit test — check managed bodies in reverse order (topmost first)
        const managed = managedRef.current
        if (pp.dragEnabled) {
            for (let i = managed.length - 1; i >= 0; i--) {
                const m = managed[i]
                if (m.role === "static") continue
                if (m.body.isStatic) continue

                // Standard bounds check with expanded grab area for moving objects.
                // Moving bodies may visually lag behind their physics position,
                // so we pad the hit area based on speed + a base grab padding.
                const inBounds = Matter.Bounds.contains(m.body.bounds, { x: px, y: py }) &&
                    Matter.Vertices.contains(m.body.vertices, { x: px, y: py })
                let inProximity = false
                if (!inBounds) {
                    const bdx = m.body.position.x - px
                    const bdy = m.body.position.y - py
                    const bHalfW = (m.body.bounds.max.x - m.body.bounds.min.x) / 2
                    const bHalfH = (m.body.bounds.max.y - m.body.bounds.min.y) / 2
                    // Base padding + extra for fast-moving objects
                    const speed = m.body.speed
                    const grabPad = 10 + Math.min(speed * 3, 30)
                    inProximity = Math.abs(bdx) < bHalfW + grabPad && Math.abs(bdy) < bHalfH + grabPad
                }

                if (inBounds || inProximity) {
                    if (m.isPointerLayer) return

                    // Prevent native browser drag (ghost image / blocked cursor)
                    e.preventDefault()

                    const offset = {
                        x: px - m.body.position.x,
                        y: py - m.body.position.y,
                    }
                    dragRef.current = {
                        managed: m,
                        offset,
                        history: [{ pos: { x: px, y: py }, time: performance.now() }],
                    }
                    cursorRef.current = { x: px, y: py }
                    Matter.Sleeping.set(m.body, false)
                    m.el.style.cursor = "grabbing"
                    return
                }
            }
        }

        // Set cursor for cursor influence (even if no drag started)
        cursorRef.current = { x: px, y: py }
    }, [])

    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (e.pointerType === "touch") return
        const parent = parentRef.current
        if (!parent) return

        const parentRect = parent.getBoundingClientRect()
        const px = e.clientX - parentRect.left
        const py = e.clientY - parentRect.top

        cursorRef.current = { x: px, y: py }

        const drag = dragRef.current
        if (drag) {
            const now = performance.now()
            drag.history.push({ pos: { x: px, y: py }, time: now })
            if (drag.history.length > 6) drag.history.shift()
        }
    }, [])

    const handlePointerUp = useCallback((e?: PointerEvent) => {
        // Touch up handled by handleTouchEnd; skip pointer touch events
        if (e && e.pointerType === "touch") return
        // When called without event (from handlePointerLeave), clear cursor
        if (!e) cursorRef.current = null
        const drag = dragRef.current
        if (drag && propsRef.current.throwEnabled) {
            const pp = propsRef.current
            const hist = drag.history
            if (hist.length >= 2) {
                const recent = hist[hist.length - 1]
                const older = hist[Math.max(0, hist.length - 3)]
                const dt = (recent.time - older.time) / 1000
                if (dt > 0.005) {
                    // Calculate throw velocity in pixels/sec, then scale to Matter.js units
                    let vx = ((recent.pos.x - older.pos.x) / dt) * pp.throwStrength * 0.015
                    let vy = ((recent.pos.y - older.pos.y) / dt) * pp.throwStrength * 0.015

                    // Clamp throw to velocity cap
                    const throwSpeed = Math.sqrt(vx * vx + vy * vy)
                    if (throwSpeed > pp.velocityCap) {
                        const s = pp.velocityCap / throwSpeed
                        vx *= s
                        vy *= s
                    }

                    Body.setVelocity(drag.managed.body, { x: vx, y: vy })

                    // Torque from off-center grab
                    if (pp.rotationEnabled) {
                        const cross = drag.offset.x * vy - drag.offset.y * vx
                        Body.setAngularVelocity(
                            drag.managed.body,
                            drag.managed.body.angularVelocity +
                                Math.max(-0.15, Math.min(0.15, cross * 0.0003))
                        )
                    }
                }
            }
        }
        if (drag) {
            // Always wake the body on release so gravity/forces take effect immediately
            Matter.Sleeping.set(drag.managed.body, false)
            if (!drag.managed.isPointerLayer) drag.managed.el.style.cursor = "grab"
        }
        dragRef.current = null
    }, [])

    const handlePointerLeave = useCallback(() => {
        cursorRef.current = null
        if (dragRef.current) handlePointerUp()
    }, [handlePointerUp])

    // ── Touch event handlers ──────────────────────────────────────────
    // Touch events handle ALL touch interaction. Pointer events skip touch.
    // No touch-action CSS needed — we cancel scroll via preventDefault on
    // the first touchmove when the touch is inside the body cluster.

    const touchActiveRef = useRef(false)

    const isTouchInCluster = useCallback((px: number, py: number): boolean => {
        const managed = managedRef.current
        const pad = 40
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        let hasDynamic = false
        for (const m of managed) {
            if (m.role === "static" || m.body.isStatic) continue
            hasDynamic = true
            const b = m.body.bounds
            if (b.min.x < minX) minX = b.min.x
            if (b.min.y < minY) minY = b.min.y
            if (b.max.x > maxX) maxX = b.max.x
            if (b.max.y > maxY) maxY = b.max.y
        }
        if (!hasDynamic) return false
        return px >= minX - pad && px <= maxX + pad && py >= minY - pad && py <= maxY + pad
    }, [])

    const handleTouchStart = useCallback((e: TouchEvent) => {
        const pp = propsRef.current
        if (!pp.touchEnabled) return
        if (!pp.dragEnabled && pp.cursorInfluence === "off") return
        const parent = parentRef.current
        if (!parent) return
        const touch = e.touches[0]
        if (!touch) return
        const parentRect = parent.getBoundingClientRect()
        const px = touch.clientX - parentRect.left
        const py = touch.clientY - parentRect.top

        const inCluster = isTouchInCluster(px, py)


        // Outside the body cluster? Let scroll happen normally.
        if (!inCluster) {
            touchActiveRef.current = false
            return
        }

        // Inside the cluster — mark active (scroll will be blocked on first touchmove)
        touchActiveRef.current = true

        // Hit test for drag
        const managed = managedRef.current
        if (pp.dragEnabled) {
            for (let i = managed.length - 1; i >= 0; i--) {
                const m = managed[i]
                if (m.role === "static" || m.body.isStatic) continue

                const inBounds = Matter.Bounds.contains(m.body.bounds, { x: px, y: py }) &&
                    Matter.Vertices.contains(m.body.vertices, { x: px, y: py })
                let inProximity = false
                if (!inBounds) {
                    const bdx = m.body.position.x - px
                    const bdy = m.body.position.y - py
                    const bHalfW = (m.body.bounds.max.x - m.body.bounds.min.x) / 2
                    const bHalfH = (m.body.bounds.max.y - m.body.bounds.min.y) / 2
                    const speed = m.body.speed
                    const grabPad = 10 + Math.min(speed * 3, 30)
                    inProximity = Math.abs(bdx) < bHalfW + grabPad && Math.abs(bdy) < bHalfH + grabPad
                }

                if (inBounds || inProximity) {
                    if (m.isPointerLayer) return
                    dragRef.current = {
                        managed: m,
                        offset: { x: px - m.body.position.x, y: py - m.body.position.y },
                        history: [{ pos: { x: px, y: py }, time: performance.now() }],
                    }
                    cursorRef.current = { x: px, y: py }
                    Matter.Sleeping.set(m.body, false)
                    return
                }
            }
        }

        // No drag started — set cursor for influence (repel/attract/nudge)
        cursorRef.current = { x: px, y: py }
    }, [isTouchInCluster])

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!touchActiveRef.current) return
        // Block scroll — this is the key call that prevents the browser from scrolling
        e.preventDefault()

        const parent = parentRef.current
        if (!parent) return
        const touch = e.touches[0]
        if (!touch) return
        const parentRect = parent.getBoundingClientRect()
        const px = touch.clientX - parentRect.left
        const py = touch.clientY - parentRect.top

        cursorRef.current = { x: px, y: py }

        const drag = dragRef.current
        if (drag) {
            const now = performance.now()
            drag.history.push({ pos: { x: px, y: py }, time: now })
            if (drag.history.length > 6) drag.history.shift()
        }
    }, [])

    const handleTouchEnd = useCallback(() => {
        if (!touchActiveRef.current) return
        touchActiveRef.current = false

        // Handle throw if dragging
        const drag = dragRef.current
        if (drag && propsRef.current.throwEnabled) {
            const pp = propsRef.current
            const hist = drag.history
            if (hist.length >= 2) {
                const recent = hist[hist.length - 1]
                const older = hist[Math.max(0, hist.length - 3)]
                const dt = (recent.time - older.time) / 1000
                if (dt > 0.005) {
                    let vx = ((recent.pos.x - older.pos.x) / dt) * pp.throwStrength * 0.015
                    let vy = ((recent.pos.y - older.pos.y) / dt) * pp.throwStrength * 0.015
                    const throwSpeed = Math.sqrt(vx * vx + vy * vy)
                    if (throwSpeed > pp.velocityCap) {
                        const s = pp.velocityCap / throwSpeed
                        vx *= s
                        vy *= s
                    }
                    Body.setVelocity(drag.managed.body, { x: vx, y: vy })
                    if (pp.rotationEnabled) {
                        const cross = drag.offset.x * vy - drag.offset.y * vx
                        Body.setAngularVelocity(
                            drag.managed.body,
                            drag.managed.body.angularVelocity +
                                Math.max(-0.15, Math.min(0.15, cross * 0.0003))
                        )
                    }
                }
            }
        }
        if (drag) {
            Matter.Sleeping.set(drag.managed.body, false)
            drag.managed.el.style.cursor = "grab"
        }
        dragRef.current = null
        cursorRef.current = null
    }, [])

    // ── Setup and teardown ──────────────────────────────────────────────

    const initedRef = useRef(false)
    const pausedRef = useRef(false)

    // Refs for event handlers so listeners always call the latest version
    const startSimRef = useRef<() => void>(() => {})
    const pauseSimRef = useRef<() => void>(() => {})
    const resetSimRef = useRef<() => void>(() => {})
    const replaySimRef = useRef<() => void>(() => {})

    const stopSimulation = useCallback(() => {
        initedRef.current = false
        // Cancel any pending retry timer from startSimulation
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current)
            retryTimerRef.current = null
        }
        cancelAnimationFrame(rafRef.current)

        const parent = parentRef.current
        if (parent) {
            parent.removeEventListener("pointerdown", handlePointerDown, { capture: true })
            parent.removeEventListener("pointermove", handlePointerMove, { capture: true })
            parent.removeEventListener("pointerup", handlePointerUp, true)
            parent.removeEventListener("pointercancel", handlePointerUp as any, true)
            parent.removeEventListener("pointerleave", handlePointerLeave)
            parent.removeEventListener("touchstart", handleTouchStart, { capture: true })
            parent.removeEventListener("touchmove", handleTouchMove, { capture: true })
            parent.removeEventListener("touchend", handleTouchEnd, { capture: true })
            parent.removeEventListener("touchcancel", handleTouchEnd, { capture: true })
        }

        // Remove debug overlays
        for (const el of debugOverlaysRef.current) {
            el.remove()
        }
        debugOverlaysRef.current = []

        for (const m of managedRef.current) {
            m.el.style.translate = ""
            m.el.style.rotate = ""
            m.el.style.willChange = ""
            m.el.style.cursor = ""
            m.el.style.scale = ""
            m.el.style.transition = ""
            m.el.style.filter = ""
            m.el.style.outline = ""
            m.el.style.outlineOffset = ""
            delete m.el.dataset.driftHue
            delete m.el.dataset.driftHueTime
        }

        if (engineRef.current) {
            World.clear(engineRef.current.world, false)
            Engine.clear(engineRef.current)
            engineRef.current = null
        }

        managedRef.current = []
        wallsRef.current = []
        ignoredElsRef.current = new Set()
    }, [handlePointerDown, handlePointerMove, handlePointerUp, handlePointerLeave, handleTouchStart, handleTouchMove, handleTouchEnd])

    // Track retry timers so they can be cancelled on unmount
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const startSimulation = useCallback((retryCount = 0) => {
        if (initedRef.current) return
        initedRef.current = true
        pausedRef.current = false

        init()

        const parent = parentRef.current
        // If init failed to find a parent or no bodies found (DOM not ready),
        // retry with backoff up to ~3 seconds total
        if (!parent || managedRef.current.length === 0) {
            initedRef.current = false
            if (retryCount < 10) {
                const delay = Math.min(100 * (retryCount + 1), 500)
                retryTimerRef.current = setTimeout(() => startSimulation(retryCount + 1), delay)
            } else {
            }
            return
        }

        if (parent) {
            parent.addEventListener("pointerdown", handlePointerDown, { capture: true })
            parent.addEventListener("pointermove", handlePointerMove, { capture: true })
            parent.addEventListener("pointerup", handlePointerUp, true)
            parent.addEventListener("pointercancel", handlePointerUp as any, true)
            parent.addEventListener("pointerleave", handlePointerLeave)
            // Touch listeners handle all touch interaction (drag, cursor, scroll blocking)
            // touchmove MUST be passive: false so preventDefault() can block scroll
            parent.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true })
            parent.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false })
            parent.addEventListener("touchend", handleTouchEnd, { capture: true })
            parent.addEventListener("touchcancel", handleTouchEnd, { capture: true })
        }

        lastTimeRef.current = 0
        rafRef.current = requestAnimationFrame(animate)
    }, [init, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerLeave, handleTouchStart, handleTouchMove, handleTouchEnd, animate])

    const pauseSimulation = useCallback(() => {
        pausedRef.current = !pausedRef.current
        // If unpausing, restart the animation loop
        if (!pausedRef.current && initedRef.current) {
            lastTimeRef.current = 0
            rafRef.current = requestAnimationFrame(animate)
        }
    }, [animate])

    const resetSimulation = useCallback(() => {
        if (!initedRef.current) return
        pausedRef.current = false
        stopSimulation()
    }, [stopSimulation])

    const replaySimulation = useCallback(() => {
        if (!initedRef.current) return
        pausedRef.current = false
        cancelAnimationFrame(rafRef.current)

        for (const m of managedRef.current) {
            if (m.role === "static") continue
            Body.setPosition(m.body, { x: m.homeCenter.x, y: m.homeCenter.y })
            Body.setAngle(m.body, m.homeAngle)
            Body.setVelocity(m.body, { x: 0, y: 0 })
            Body.setAngularVelocity(m.body, 0)
            m.el.style.translate = ""
            m.el.style.rotate = ""
        }

        const pp = propsRef.current
        for (const m of managedRef.current) {
            if (m.role === "static") continue
            if (pp.motionMode === "zeroGravity") {
                const angle = Math.random() * Math.PI * 2
                const speed = 1 + Math.random() * 2
                Body.setVelocity(m.body, {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed,
                })
                if (pp.rotationEnabled) {
                    Body.setAngularVelocity(m.body, (Math.random() - 0.5) * 0.02)
                }
            } else if (pp.motionMode === "bounce") {
                const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8
                const speed = 3 + Math.random() * 4
                Body.setVelocity(m.body, {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed,
                })
                if (pp.rotationEnabled) {
                    Body.setAngularVelocity(m.body, (Math.random() - 0.5) * 0.04)
                }
            } else if (pp.motionMode === "swarm") {
                const angle = Math.random() * Math.PI * 2
                const speed = pp.swarmSpeed * (0.8 + Math.random() * 0.4)
                Body.setVelocity(m.body, {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed,
                })
            }
        }

        lastTimeRef.current = 0
        rafRef.current = requestAnimationFrame(animate)
    }, [animate])

    // Keep refs pointing to latest versions for event listeners
    startSimRef.current = startSimulation
    pauseSimRef.current = pauseSimulation
    resetSimRef.current = resetSimulation
    replaySimRef.current = replaySimulation

    useEffect(() => {
        if (isFramerCanvas()) return

        const pp = propsRef.current
        let cleanup: (() => void) | undefined

        if (pp.startTrigger === "immediate") {
            // Start after a short delay for DOM to settle
            const timer = setTimeout(startSimulation, 100)
            cleanup = () => clearTimeout(timer)

        } else if (pp.startTrigger === "inView") {
            // Use Intersection Observer on the parent container
            const timer = setTimeout(() => {
                const self = selfRef.current
                if (!self) return
                const container = findParentContainer(self)
                if (!container) return

                // Map threshold position to rootMargin
                // "top" = trigger when top edge enters viewport bottom
                // "center" = trigger when center of element is in viewport
                // "bottom" = trigger when bottom edge enters viewport (fully visible)
                const thresholdMap = { top: 0.0, center: 0.5, bottom: 1.0 }
                const threshold = thresholdMap[pp.viewThreshold] ?? 0.5

                const observer = new IntersectionObserver(
                    ([entry]) => {
                        if (entry.isIntersecting) {
                            startSimulation()
                            observer.disconnect()
                        }
                    },
                    { threshold }
                )
                observer.observe(container)

                cleanup = () => observer.disconnect()
            }, 100)

            const outerCleanup = cleanup
            cleanup = () => {
                clearTimeout(timer)
                outerCleanup?.()
            }

        } else if (pp.startTrigger === "event") {
            // Listen for a custom DOM event
            const eventName = pp.eventName || "drift-start"
            const handler = () => startSimRef.current()
            window.addEventListener(eventName, handler)
            cleanup = () => window.removeEventListener(eventName, handler)
        }

        // Always listen for pause / reset / replay events
        // Convention: base name from eventName prop, with -pause, -reset, -replay suffixes
        const baseName = pp.eventName || "drift"
        // Strip "-start" suffix if present to get the base
        const base = baseName.replace(/-start$/, "") || "drift"

        const pauseHandler = () => pauseSimRef.current()
        const resetHandler = () => resetSimRef.current()
        const replayHandler = () => replaySimRef.current()

        window.addEventListener(`${base}-pause`, pauseHandler)
        window.addEventListener(`${base}-reset`, resetHandler)
        window.addEventListener(`${base}-replay`, replayHandler)

        return () => {
            cleanup?.()
            window.removeEventListener(`${base}-pause`, pauseHandler)
            window.removeEventListener(`${base}-reset`, resetHandler)
            window.removeEventListener(`${base}-replay`, replayHandler)
            stopSimulation()
        }
    }, [])

    // ── ResizeObserver ──────────────────────────────────────────────────

    useEffect(() => {
        const parent = parentRef.current
        const engine = engineRef.current
        if (!parent || !engine) return

        const ro = new ResizeObserver(() => {
            const rect = parent.getBoundingClientRect()
            const W = rect.width
            const H = rect.height
            const sp = propsRef.current.simulationPadding
            boundsRef.current = { minX: -sp, minY: -sp, maxX: W + sp, maxY: H + sp, visW: W, visH: H }

            // Update wall positions (expanded by simulation padding)
            const walls = wallsRef.current
            if (walls.length === 4) {
                const t = 60
                Body.setPosition(walls[0], { x: W / 2, y: -sp - t / 2 })
                Body.setPosition(walls[1], { x: W / 2, y: H + sp + t / 2 })
                Body.setPosition(walls[2], { x: -sp - t / 2, y: H / 2 })
                Body.setPosition(walls[3], { x: W + sp + t / 2, y: H / 2 })
            }
        })

        ro.observe(parent)
        return () => ro.disconnect()
    }, [])

    // ── Render ───────────────────────────────────────────────────────────

    return (
        <div
            ref={selfRef}
            style={{
                ...props.style,
                width: 0,
                height: 0,
                overflow: "hidden",
                pointerEvents: "none",
                position: "absolute",
                opacity: 0,
            }}
        />
    )
}

Drift.displayName = "Drift"

// ─── Property controls ──────────────────────────────────────────────────────

addPropertyControls(Drift, {
    // ── Trigger ─────────────────────────────────────────────────────────
    startTrigger: {
        type: ControlType.Enum,
        title: "Start When",
        options: ["immediate", "inView", "event"],
        optionTitles: ["Immediate", "In View", "Event"],
        defaultValue: "immediate",
    },
    viewThreshold: {
        type: ControlType.Enum,
        title: "View Threshold",
        options: ["top", "center", "bottom"],
        optionTitles: ["Top", "Center", "Bottom"],
        defaultValue: "center",
        hidden: (p) => p.startTrigger !== "inView",
        description: "How much of the container must be visible to trigger.",
    },
    eventName: {
        type: ControlType.String,
        title: "Event Name",
        defaultValue: "drift-start",
        placeholder: "drift-start",
        hidden: (p) => p.startTrigger !== "event",
        description: "Custom DOM event name. Trigger from a button with: window.dispatchEvent(new CustomEvent('drift-start'))",
    },

    // ── Motion ──────────────────────────────────────────────────────────
    motionMode: {
        type: ControlType.Enum,
        title: "Motion Mode",
        options: ["zeroGravity", "bounce", "gravity", "swarm"],
        optionTitles: ["Zero Gravity", "Bounce", "Gravity", "Swarm"],
        defaultValue: "zeroGravity",
    },
    gravityStrength: {
        type: ControlType.Number,
        title: "Gravity",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 4,
        hidden: (p) => p.motionMode !== "gravity",
        description: "Strength of downward pull (Matter.js scale)",
    },
    swarmRadius: {
        type: ControlType.Number,
        title: "Perception Radius",
        min: 30,
        max: 400,
        step: 10,
        defaultValue: 150,
        hidden: (p: any) => p.motionMode !== "swarm",
        description: "How far each body detects neighbors.",
    },
    separationWeight: {
        type: ControlType.Number,
        title: "Separation",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 0.6,
        hidden: (p: any) => p.motionMode !== "swarm",
        description: "Avoidance strength — steer away from nearby bodies.",
    },
    alignmentWeight: {
        type: ControlType.Number,
        title: "Alignment",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 2.5,
        hidden: (p: any) => p.motionMode !== "swarm",
        description: "Heading matching — steer toward neighbors' average direction.",
    },
    cohesionWeight: {
        type: ControlType.Number,
        title: "Cohesion",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 1.5,
        hidden: (p: any) => p.motionMode !== "swarm",
        description: "Flock centering — steer toward neighbors' average position.",
    },
    swarmSpeed: {
        type: ControlType.Number,
        title: "Swarm Speed",
        min: 0.5,
        max: 15,
        step: 0.5,
        defaultValue: 3,
        hidden: (p: any) => p.motionMode !== "swarm",
        description: "Target cruising speed for the flock.",
    },

    // ── Physics ─────────────────────────────────────────────────────────
    bounciness: {
        type: ControlType.Number,
        title: "Bounciness",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.4,
    },
    airResistance: {
        type: ControlType.Number,
        title: "Air Resistance",
        min: 0,
        max: 0.2,
        step: 0.005,
        defaultValue: 0.02,
        description: "Higher values make objects slow down faster in motion.",
    },
    stickiness: {
        type: ControlType.Number,
        title: "Stickiness",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.3,
        description: "Surface friction. Higher = objects grip and stop sliding.",
    },
    velocityCap: {
        type: ControlType.Number,
        title: "Speed Limit",
        min: 1,
        max: 100,
        step: 1,
        defaultValue: 30,
        description: "Max velocity (Matter.js units)",
    },
    rotationEnabled: {
        type: ControlType.Boolean,
        title: "Rotation",
        defaultValue: true,
    },
    angularDamping: {
        type: ControlType.Number,
        title: "Rotation Damping",
        min: 0,
        max: 0.2,
        step: 0.005,
        defaultValue: 0.05,
        hidden: (p) => !p.rotationEnabled,
    },

    // ── Interaction ─────────────────────────────────────────────────────
    cursorInfluence: {
        type: ControlType.Enum,
        title: "Cursor Effect",
        options: ["off", "nudge", "repel", "attract"],
        optionTitles: ["Off", "Nudge", "Repel", "Attract"],
        defaultValue: "nudge",
    },
    cursorRadius: {
        type: ControlType.Number,
        title: "Cursor Radius",
        min: 20,
        max: 600,
        step: 10,
        defaultValue: 150,
        hidden: (p) => p.cursorInfluence === "off",
    },
    cursorStrength: {
        type: ControlType.Number,
        title: "Cursor Force",
        min: 0.001,
        max: 0.1,
        step: 0.001,
        defaultValue: 0.01,
        hidden: (p) => p.cursorInfluence === "off",
    },
    dragEnabled: {
        type: ControlType.Boolean,
        title: "Drag",
        defaultValue: true,
        description: "Click and drag to grab and move objects directly.",
    },
    throwEnabled: {
        type: ControlType.Boolean,
        title: "Throw",
        defaultValue: true,
        hidden: (p) => !p.dragEnabled,
    },
    throwStrength: {
        type: ControlType.Number,
        title: "Throw Strength",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 1.2,
        hidden: (p) => !p.dragEnabled || !p.throwEnabled,
    },
    touchEnabled: {
        type: ControlType.Boolean,
        title: "Touch Interaction",
        defaultValue: true,
        description: "Enable touch drag and cursor effects on mobile. When off, touch only scrolls.",
    },
    returnHome: {
        type: ControlType.Boolean,
        title: "Return Home",
        defaultValue: false,
    },
    returnStrength: {
        type: ControlType.Number,
        title: "Return Strength",
        min: 0.001,
        max: 0.05,
        step: 0.001,
        defaultValue: 0.005,
        hidden: (p) => !p.returnHome,
    },

    // ── Boundaries ──────────────────────────────────────────────────────
    boundToContainer: {
        type: ControlType.Boolean,
        title: "Contain in Bounds",
        defaultValue: true,
    },
    simulationPadding: {
        type: ControlType.Number,
        title: "Simulation Padding",
        min: 0,
        max: 500,
        step: 10,
        defaultValue: 0,
        description: "Adds invisible space around the container so objects can move beyond the visible frame before bouncing back.",
        hidden: (p) => !p.boundToContainer,
    },

    // ── Layer Selection ─────────────────────────────────────────────────
    defaultRole: {
        type: ControlType.Enum,
        title: "Default Role",
        options: ["dynamic", "static"],
        optionTitles: ["Dynamic", "Static"],
        defaultValue: "dynamic",
        description: "Default role for unlisted layers. Static = all layers are colliders unless listed as dynamic.",
    },
    staticColliders: {
        type: ControlType.String,
        title: "Static Colliders",
        defaultValue: "",
        placeholder: "#0, #5-#15, COLLIDER",
        description: "Use #0, #1… for index, #5-#15 for range, or text/name. Enable Debug View to see indices.",
        hidden: (p: any) => p.defaultRole === "static",
    },
    dynamicLayers: {
        type: ControlType.String,
        title: "Dynamic Layers",
        defaultValue: "",
        placeholder: "#0-#12, Rectangle",
        description: "Use #index, ranges, or name/prefix matching. Matching layers become movable; all others stay static colliders.",
        hidden: (p: any) => p.defaultRole !== "static",
    },
    ignoredLayers: {
        type: ControlType.String,
        title: "Ignored Layers",
        defaultValue: "",
        placeholder: "#2, #10-#12, Background",
        description: "Use #index, ranges like #5-#15, or name/prefix matching. These layers won't participate in physics.",
    },

    // ── Collisions ──────────────────────────────────────────────────────
    collisionEnabled: {
        type: ControlType.Boolean,
        title: "Collisions",
        defaultValue: true,
    },
    selfCollide: {
        type: ControlType.Boolean,
        title: "Self Collide",
        defaultValue: true,
        description: "When off, dynamic objects pass through each other but still collide with static colliders and scene bounds.",
    },
    colliderPadding: {
        type: ControlType.Number,
        title: "Collider Padding",
        min: -20,
        max: 40,
        step: 1,
        defaultValue: 0,
    },

    // ── Effects ──────────────────────────────────────────────────────────
    collisionColorCycle: {
        type: ControlType.Boolean,
        title: "Collision Color",
        defaultValue: false,
        description: "Cycle hue on wall bounces and body-to-body collisions. Works best on white/light elements.",
    },
    squishOnBounce: {
        type: ControlType.Boolean,
        title: "Squish on Bounce",
        defaultValue: false,
        description: "Objects squash and stretch on wall and body collisions.",
    },

    // ── Debug ───────────────────────────────────────────────────────────
    debugView: {
        type: ControlType.Boolean,
        title: "Debug View",
        defaultValue: false,
    },
    showColliderBounds: {
        type: ControlType.Boolean,
        title: "Show Bounds",
        defaultValue: false,
    },
})
