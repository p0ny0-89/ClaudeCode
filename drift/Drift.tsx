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
    type: "index" | "name"
    value: string // lowercase name, or index as string
}

/**
 * Parse a comma-separated identifier list. Supports:
 *  - "#0", "#3"  → index-based (0-indexed child position, excluding Drift itself)
 *  - "COLLIDER"  → name/text-based matching
 */
function parseSelectorList(input: string): ParsedSelector[] {
    if (!input || !input.trim()) return []
    return input
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
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
        // Name matching: check if any identifier contains the pattern
        if (identifiers.length === 0) return false
        return identifiers.some(
            (id) => id === sel.value || id.includes(sel.value)
        )
    })
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface DriftProps {
    motionMode: "zeroGravity" | "bounce" | "gravity"
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

    staticColliders: string
    ignoredLayers: string
    pointerLayers: string
    collisionEnabled: boolean
    colliderPadding: number

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
    staticColliders: "",
    ignoredLayers: "",
    pointerLayers: "",
    collisionEnabled: true,
    colliderPadding: 0,
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
    const cursorRef = useRef<{ x: number; y: number } | null>(null)
    const dragRef = useRef<{
        managed: ManagedBody
        offset: { x: number; y: number }
        history: { pos: { x: number; y: number }; time: number }[]
    } | null>(null)
    const propsRef = useRef(p)
    propsRef.current = p
    const boundsRef = useRef({ width: 0, height: 0 })

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
        boundsRef.current = { width: W, height: H }

        const pp = propsRef.current

        // Create engine
        const isBounce = pp.motionMode === "bounce"
        const engine = Engine.create({
            gravity: {
                x: 0,
                y:
                    pp.motionMode === "gravity"
                        ? pp.gravityStrength
                        : isBounce
                        ? pp.gravityStrength * 0.05
                        : 0,
                scale: 0.001,
            },
            // Disable sleeping in bounce mode — objects must stay in motion
            enableSleeping: !isBounce,
        })
        // Increase solver iterations for tighter collision resolution
        ;(engine as any).positionIterations = 10
        ;(engine as any).velocityIterations = 8
        engineRef.current = engine

        const staticSelectors = parseSelectorList(pp.staticColliders)
        const ignoredSelectors = parseSelectorList(pp.ignoredLayers)
        const pointerSelectors = parseSelectorList(pp.pointerLayers)

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
            const child = eligibleChildren[ci]
            if (!child.getBoundingClientRect) continue

            const childRect = child.getBoundingClientRect()
            if (childRect.width === 0 && childRect.height === 0) continue

            // Role — ci is the 0-based index among non-Drift siblings
            if (matchesSelectorList(child, ci, ignoredSelectors)) continue

            let role: BodyRole = "dynamic"
            if (matchesSelectorList(child, ci, staticSelectors)) role = "static"

            const computedTransform = getComputedStyle(child).transform
            const originalTransform =
                computedTransform && computedTransform !== "none"
                    ? computedTransform
                    : ""
            const homeAngle = parseRotation(originalTransform)

            const w = child.offsetWidth
            const h = child.offsetHeight
            const cx = childRect.left + childRect.width / 2 - parentRect.left
            const cy = childRect.top + childRect.height / 2 - parentRect.top

            const pad = pp.colliderPadding
            const isStatic = role === "static"

            const matterBody = Bodies.rectangle(cx, cy, w + pad * 2, h + pad * 2, {
                angle: homeAngle,
                isStatic,
                // Bounce mode: near-perfect elasticity, no friction, no air drag
                restitution: isBounce ? Math.max(pp.bounciness, 0.95) : pp.bounciness,
                friction: isBounce ? 0.01 : pp.stickiness * 1.0,
                frictionStatic: isBounce ? 0.01 : pp.stickiness * 2.0,
                frictionAir: isBounce ? 0.0005 : pp.airResistance,
                density: 0.001,
                slop: 0.005,
                sleepThreshold: isBounce ? Infinity : 30,
                label: getLayerName(child) || `body-${ci}`,
            })

            if (!pp.rotationEnabled && !isStatic) {
                Body.setInertia(matterBody, Infinity)
            }

            Composite.add(engine.world, matterBody)

            const isPointerLayer = matchesSelectorList(child, ci, pointerSelectors)

            managed.push({
                el: child,
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

        // Set cursor on dynamic elements: grab for draggable, pointer for link layers
        for (const m of managed) {
            if (m.role !== "dynamic") continue
            if (m.isPointerLayer) {
                m.el.style.cursor = "pointer"
            } else if (pp.dragEnabled) {
                m.el.style.cursor = "grab"
            }
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

        // Container walls (if bounded)
        if (pp.boundToContainer) {
            const wallThickness = 60
            const walls = [
                // top
                Bodies.rectangle(W / 2, -wallThickness / 2, W + wallThickness * 2, wallThickness, { isStatic: true, label: "wall-top" }),
                // bottom
                Bodies.rectangle(W / 2, H + wallThickness / 2, W + wallThickness * 2, wallThickness, { isStatic: true, label: "wall-bottom" }),
                // left
                Bodies.rectangle(-wallThickness / 2, H / 2, wallThickness, H + wallThickness * 2, { isStatic: true, label: "wall-left" }),
                // right
                Bodies.rectangle(W + wallThickness / 2, H / 2, wallThickness, H + wallThickness * 2, { isStatic: true, label: "wall-right" }),
            ]
            for (const w of walls) {
                w.restitution = isBounce ? 1.0 : pp.bounciness
                w.friction = isBounce ? 0 : pp.stickiness * 1.0
            }
            Composite.add(engine.world, walls)
            wallsRef.current = walls
        }

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
            }
        }

    }, [])

    // ── Animation loop ──────────────────────────────────────────────────

    const FIXED_DT = 1000 / 60 // ~16.67ms — constant for stable physics

    const animate = useCallback((time: number) => {
        const engine = engineRef.current
        if (!engine) return

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
        }

        // Cursor forces on non-dragged bodies
        if (cursor && pp.cursorInfluence !== "off") {
            for (const m of managed) {
                if (m.role === "static") continue
                if (m.body.isStatic) continue
                if (m.body.isSleeping) continue
                if (drag && drag.managed === m) continue

                const dx = m.body.position.x - cursor.x
                const dy = m.body.position.y - cursor.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                if (dist < pp.cursorRadius && dist > 1) {
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
                        case "attract":
                            fx = -nx * strength
                            fy = -ny * strength
                            break
                    }
                    Body.applyForce(m.body, m.body.position, { x: fx, y: fy })
                }
            }
        }

        // Return-home spring
        if (pp.returnHome) {
            for (const m of managed) {
                if (m.role === "static") continue
                if (m.body.isStatic) continue
                if (drag && drag.managed === m) continue

                const dx = m.homeCenter.x - m.body.position.x
                const dy = m.homeCenter.y - m.body.position.y
                Body.applyForce(m.body, m.body.position, {
                    x: dx * pp.returnStrength * m.body.mass * 0.001,
                    y: dy * pp.returnStrength * m.body.mass * 0.001,
                })

                if (pp.rotationEnabled) {
                    const angleDiff = m.homeAngle - m.body.angle
                    Body.setAngularVelocity(
                        m.body,
                        m.body.angularVelocity + angleDiff * pp.returnStrength * 0.5
                    )
                }
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

        // Bounce mode: maintain energy — if a body slows below a minimum speed, nudge it
        if (pp.motionMode === "bounce") {
            const minSpeed = 1.5
            for (const m of managed) {
                if (m.body.isStatic) continue
                if (drag && drag.managed === m) continue
                const v = m.body.velocity
                const speed = Math.sqrt(v.x * v.x + v.y * v.y)
                if (speed < minSpeed) {
                    // Boost in the current direction, or random if nearly stopped
                    const angle = speed > 0.1
                        ? Math.atan2(v.y, v.x)
                        : Math.random() * Math.PI * 2
                    Body.setVelocity(m.body, {
                        x: Math.cos(angle) * minSpeed,
                        y: Math.sin(angle) * minSpeed,
                    })
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

            // Bounds safety — if a body escapes the container, pull it back
            if (pp.boundToContainer && bounds.width > 0) {
                const pos = m.body.position
                const margin = 50
                let clamped = false
                let nx = pos.x
                let ny = pos.y

                if (pos.x < -margin) { nx = 10; clamped = true }
                if (pos.x > bounds.width + margin) { nx = bounds.width - 10; clamped = true }
                if (pos.y < -margin) { ny = 10; clamped = true }
                if (pos.y > bounds.height + margin) { ny = bounds.height - 10; clamped = true }

                if (clamped) {
                    Body.setPosition(m.body, { x: nx, y: ny })
                    Body.setVelocity(m.body, { x: 0, y: 0 })
                    Body.setAngularVelocity(m.body, 0)
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
        if (!propsRef.current.dragEnabled) return
        const parent = parentRef.current
        if (!parent) return

        const parentRect = parent.getBoundingClientRect()
        const px = e.clientX - parentRect.left
        const py = e.clientY - parentRect.top

        // Hit test — check managed bodies in reverse order (topmost first)
        const managed = managedRef.current
        for (let i = managed.length - 1; i >= 0; i--) {
            const m = managed[i]
            if (m.role === "static") continue
            if (m.body.isStatic) continue

            if (Matter.Bounds.contains(m.body.bounds, { x: px, y: py }) &&
                Matter.Vertices.contains(m.body.vertices, { x: px, y: py })) {
                // Pointer layers: let the click through for links/buttons
                if (m.isPointerLayer) return

                const offset = {
                    x: px - m.body.position.x,
                    y: py - m.body.position.y,
                }
                dragRef.current = {
                    managed: m,
                    offset,
                    history: [{ pos: { x: px, y: py }, time: performance.now() }],
                }
                Matter.Sleeping.set(m.body, false)
                m.el.style.cursor = "grabbing"
                e.preventDefault()
                return
            }
        }
    }, [])

    const handlePointerMove = useCallback((e: PointerEvent) => {
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

    const handlePointerUp = useCallback(() => {
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
        if (drag && !drag.managed.isPointerLayer) drag.managed.el.style.cursor = "grab"
        dragRef.current = null
    }, [])

    const handlePointerLeave = useCallback(() => {
        cursorRef.current = null
        if (dragRef.current) handlePointerUp()
    }, [handlePointerUp])

    // ── Setup and teardown ──────────────────────────────────────────────

    const initedRef = useRef(false)

    const startSimulation = useCallback(() => {
        if (initedRef.current) return
        initedRef.current = true

        init()

        const parent = parentRef.current
        if (parent) {
            parent.addEventListener("pointerdown", handlePointerDown, true)
            parent.addEventListener("pointermove", handlePointerMove, true)
            parent.addEventListener("pointerup", handlePointerUp, true)
            parent.addEventListener("pointerleave", handlePointerLeave)
        }

        lastTimeRef.current = 0
        rafRef.current = requestAnimationFrame(animate)
    }, [init, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerLeave, animate])

    const stopSimulation = useCallback(() => {
        initedRef.current = false
        cancelAnimationFrame(rafRef.current)

        const parent = parentRef.current
        if (parent) {
            parent.removeEventListener("pointerdown", handlePointerDown, true)
            parent.removeEventListener("pointermove", handlePointerMove, true)
            parent.removeEventListener("pointerup", handlePointerUp, true)
            parent.removeEventListener("pointerleave", handlePointerLeave)
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
            m.el.style.outline = ""
            m.el.style.outlineOffset = ""
        }

        if (engineRef.current) {
            World.clear(engineRef.current.world, false)
            Engine.clear(engineRef.current)
            engineRef.current = null
        }

        managedRef.current = []
        wallsRef.current = []
    }, [handlePointerDown, handlePointerMove, handlePointerUp, handlePointerLeave])

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
            const handler = () => startSimulation()
            window.addEventListener(eventName, handler)
            cleanup = () => window.removeEventListener(eventName, handler)
        }

        return () => {
            cleanup?.()
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
            boundsRef.current = { width: W, height: H }

            // Update wall positions
            const walls = wallsRef.current
            if (walls.length === 4) {
                const t = 60
                Body.setPosition(walls[0], { x: W / 2, y: -t / 2 })
                Body.setPosition(walls[1], { x: W / 2, y: H + t / 2 })
                Body.setPosition(walls[2], { x: -t / 2, y: H / 2 })
                Body.setPosition(walls[3], { x: W + t / 2, y: H / 2 })
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

    motionMode: {
        type: ControlType.Enum,
        title: "Motion Mode",
        options: ["zeroGravity", "bounce", "gravity"],
        optionTitles: ["Zero Gravity", "Bounce", "Gravity"],
        defaultValue: "zeroGravity",
    },
    gravityStrength: {
        type: ControlType.Number,
        title: "Gravity",
        min: 0,
        max: 10,
        step: 0.1,
        defaultValue: 4,
        hidden: (p) => p.motionMode === "zeroGravity",
        description: "Strength of downward pull (Matter.js scale)",
    },
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
    throwStrength: {
        type: ControlType.Number,
        title: "Throw Strength",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 1.2,
        hidden: (p) => !p.dragEnabled,
    },
    boundToContainer: {
        type: ControlType.Boolean,
        title: "Contain in Bounds",
        defaultValue: true,
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
    stickiness: {
        type: ControlType.Number,
        title: "Stickiness",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.3,
        description: "Surface friction. Higher = objects grip and stop sliding.",
    },

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
    },
    throwEnabled: {
        type: ControlType.Boolean,
        title: "Throw",
        defaultValue: true,
        hidden: (p) => !p.dragEnabled,
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

    staticColliders: {
        type: ControlType.String,
        title: "Static Colliders",
        defaultValue: "",
        placeholder: "#0, COLLIDER, #3",
        description: "Use #0, #1… for index or text/name to match. Enable Debug View to see indices.",
    },
    ignoredLayers: {
        type: ControlType.String,
        title: "Ignored Layers",
        defaultValue: "",
        placeholder: "#2, Background",
        description: "Use #index or text/name. These layers won't participate in physics.",
    },
    pointerLayers: {
        type: ControlType.String,
        title: "Link Layers",
        defaultValue: "",
        placeholder: "#2, Button",
        description: "These elements show a pointer cursor and pass clicks through for links/buttons.",
    },

    collisionEnabled: {
        type: ControlType.Boolean,
        title: "Collisions",
        defaultValue: true,
    },
    colliderPadding: {
        type: ControlType.Number,
        title: "Collider Padding",
        min: -20,
        max: 40,
        step: 1,
        defaultValue: 0,
    },

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
