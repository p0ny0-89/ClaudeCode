// Drift — Invisible physics behavior layer for Framer
// Drop into a parent container to activate interactive motion on its direct child layers.

import { addPropertyControls, ControlType } from "framer"
import * as React from "react"
import { useCallback, useEffect, useRef } from "react"

// ─── Vector math ────────────────────────────────────────────────────────────

interface Vec2 {
    x: number
    y: number
}

const vec = (x = 0, y = 0): Vec2 => ({ x, y })
const vadd = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
const vsub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const vscale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })
const vlen = (a: Vec2): number => Math.sqrt(a.x * a.x + a.y * a.y)
const vnorm = (a: Vec2): Vec2 => {
    const l = vlen(a)
    return l > 0.0001 ? vscale(a, 1 / l) : vec()
}
const vdot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
const vclamp = (v: Vec2, max: number): Vec2 => {
    const l = vlen(v)
    return l > max ? vscale(vnorm(v), max) : v
}

// ─── Body types ─────────────────────────────────────────────────────────────

type BodyRole = "dynamic" | "static" | "ignored" | "pinpush"

interface Body {
    el: HTMLElement
    role: BodyRole
    home: Vec2 // authored position relative to parent
    pos: Vec2 // current position (offset from home)
    vel: Vec2
    size: Vec2 // width, height
    mass: number
    restitution: number
    originalTransform: string
    isPinned: boolean // temporarily pinned during hover
    expandedSize: Vec2 | null // size during pin expansion
}

interface Bounds {
    width: number
    height: number
}

// ─── Collision detection (AABB) ─────────────────────────────────────────────

interface Collision {
    bodyA: Body
    bodyB: Body
    normal: Vec2
    overlap: number
}

function getBodyRect(body: Body): { x: number; y: number; w: number; h: number } {
    const s = body.expandedSize ?? body.size
    return {
        x: body.home.x + body.pos.x,
        y: body.home.y + body.pos.y,
        w: s.x,
        h: s.y,
    }
}

function detectCollision(a: Body, b: Body): Collision | null {
    const ra = getBodyRect(a)
    const rb = getBodyRect(b)

    const overlapX = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x)
    const overlapY = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y)

    if (overlapX <= 0 || overlapY <= 0) return null

    // Choose axis with smallest overlap for minimum translation
    if (overlapX < overlapY) {
        const nx = ra.x + ra.w / 2 < rb.x + rb.w / 2 ? -1 : 1
        return { bodyA: a, bodyB: b, normal: vec(nx, 0), overlap: overlapX }
    } else {
        const ny = ra.y + ra.h / 2 < rb.y + rb.h / 2 ? -1 : 1
        return { bodyA: a, bodyB: b, normal: vec(0, ny), overlap: overlapY }
    }
}

function resolveCollision(col: Collision, restitution: number) {
    const { bodyA, bodyB, normal, overlap } = col
    const aStatic = bodyA.role === "static" || bodyA.isPinned
    const bStatic = bodyB.role === "static" || bodyB.isPinned

    if (aStatic && bStatic) return

    // Positional correction
    const totalMass = (aStatic ? 0 : bodyA.mass) + (bStatic ? 0 : bodyB.mass)
    if (totalMass === 0) return

    const correction = overlap + 0.5 // slight extra push to avoid sticking
    if (!aStatic) {
        const ratio = bStatic ? 1 : bodyA.mass / totalMass
        bodyA.pos = vadd(bodyA.pos, vscale(normal, correction * ratio))
    }
    if (!bStatic) {
        const ratio = aStatic ? 1 : bodyB.mass / totalMass
        bodyB.pos = vsub(bodyB.pos, vscale(normal, correction * ratio))
    }

    // Velocity resolution
    const relVel = vsub(aStatic ? vec() : bodyA.vel, bStatic ? vec() : bodyB.vel)
    const velAlongNormal = vdot(relVel, normal)

    // Only resolve if bodies are moving toward each other
    if (velAlongNormal > 0) return

    const e = restitution
    const j = -(1 + e) * velAlongNormal / totalMass

    if (!aStatic) {
        bodyA.vel = vadd(bodyA.vel, vscale(normal, j * bodyA.mass))
    }
    if (!bStatic) {
        bodyB.vel = vsub(bodyB.vel, vscale(normal, j * bodyB.mass))
    }
}

// ─── DOM helpers ────────────────────────────────────────────────────────────

function findParentContainer(self: HTMLElement): HTMLElement | null {
    // Walk up to find the Framer container that holds siblings.
    // Framer wraps code components, so we walk up until we find
    // an element with multiple children that looks like a container.
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
        el.getAttribute("name") ||
        el.getAttribute("aria-label") ||
        ""
    )
}

function parseNameList(input: string): string[] {
    if (!input || !input.trim()) return []
    return input
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
}

function matchesNameList(el: HTMLElement, nameList: string[]): boolean {
    if (nameList.length === 0) return false
    const name = getLayerName(el).toLowerCase()
    if (!name) return false
    return nameList.some(
        (pattern) => name === pattern || name.includes(pattern)
    )
}

// ─── Drift component props ──────────────────────────────────────────────────

interface DriftProps {
    // Behavior
    motionMode: "zeroGravity" | "bounce" | "gravity"
    gravityStrength: number
    bounciness: number
    airResistance: number
    velocityCap: number
    throwStrength: number
    boundToContainer: boolean

    // Interaction
    cursorInfluence: "off" | "nudge" | "repel" | "attract"
    cursorRadius: number
    cursorStrength: number
    dragEnabled: boolean
    throwEnabled: boolean
    returnHome: boolean
    returnStrength: number

    // Layer assignment
    staticColliders: string
    ignoredLayers: string
    pinPushLayers: string

    // Collider
    collisionEnabled: boolean
    collisionIterations: number
    colliderPadding: number

    // Advanced
    debugView: boolean
    showColliderBounds: boolean

    // Framer
    style?: React.CSSProperties
}

// ─── Default values ─────────────────────────────────────────────────────────

const defaultProps: Partial<DriftProps> = {
    motionMode: "zeroGravity",
    gravityStrength: 800,
    bounciness: 0.5,
    airResistance: 0.02,
    velocityCap: 1500,
    throwStrength: 1.2,
    boundToContainer: true,
    cursorInfluence: "nudge",
    cursorRadius: 150,
    cursorStrength: 600,
    dragEnabled: true,
    throwEnabled: true,
    returnHome: false,
    returnStrength: 0.03,
    staticColliders: "",
    ignoredLayers: "",
    pinPushLayers: "",
    collisionEnabled: true,
    collisionIterations: 3,
    colliderPadding: 0,
    debugView: false,
    showColliderBounds: false,
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function Drift(props: DriftProps) {
    const p = { ...defaultProps, ...props } as Required<DriftProps>

    const selfRef = useRef<HTMLDivElement>(null)
    const bodiesRef = useRef<Body[]>([])
    const boundsRef = useRef<Bounds>({ width: 0, height: 0 })
    const rafRef = useRef<number>(0)
    const cursorRef = useRef<Vec2 | null>(null)
    const dragRef = useRef<{
        body: Body
        offset: Vec2
        history: { pos: Vec2; time: number }[]
    } | null>(null)
    const parentRef = useRef<HTMLElement | null>(null)
    const initializedRef = useRef(false)
    const propsRef = useRef(p)
    propsRef.current = p

    // Track hovered pin-push layers
    const hoveredPinPushRef = useRef<Set<HTMLElement>>(new Set())

    // ── Initialize bodies from DOM ──────────────────────────────────────

    const initBodies = useCallback(() => {
        const self = selfRef.current
        if (!self) return

        const parent = findParentContainer(self)
        if (!parent) return
        parentRef.current = parent

        const parentRect = parent.getBoundingClientRect()
        boundsRef.current = {
            width: parentRect.width,
            height: parentRect.height,
        }

        const staticNames = parseNameList(propsRef.current.staticColliders)
        const ignoredNames = parseNameList(propsRef.current.ignoredLayers)
        const pinPushNames = parseNameList(propsRef.current.pinPushLayers)

        const bodies: Body[] = []
        const selfEls = new Set<HTMLElement>()

        // Find our own wrapper element(s) to exclude
        let wrapper: HTMLElement | null = self
        while (wrapper && wrapper !== parent) {
            selfEls.add(wrapper)
            wrapper = wrapper.parentElement
        }

        for (let i = 0; i < parent.children.length; i++) {
            const child = parent.children[i] as HTMLElement
            if (selfEls.has(child)) continue
            if (!child.getBoundingClientRect) continue

            const childRect = child.getBoundingClientRect()
            if (childRect.width === 0 && childRect.height === 0) continue

            // Determine role
            let role: BodyRole = "dynamic"
            if (matchesNameList(child, ignoredNames)) {
                role = "ignored"
            } else if (matchesNameList(child, staticNames)) {
                role = "static"
            } else if (matchesNameList(child, pinPushNames)) {
                role = "pinpush"
            }

            if (role === "ignored") continue // skip entirely

            const home = vec(
                childRect.left - parentRect.left,
                childRect.top - parentRect.top
            )

            const originalTransform =
                child.style.transform ||
                getComputedStyle(child).transform ||
                ""

            bodies.push({
                el: child,
                role,
                home,
                pos: vec(),
                vel: vec(),
                size: vec(childRect.width, childRect.height),
                mass: 1,
                restitution: propsRef.current.bounciness,
                originalTransform:
                    originalTransform === "none" ? "" : originalTransform,
                isPinned: false,
                expandedSize: null,
            })
        }

        bodiesRef.current = bodies
        initializedRef.current = true
    }, [])

    // ── Apply initial drift for zero gravity and bounce modes ────────────

    const applyInitialMotion = useCallback(() => {
        const bodies = bodiesRef.current
        const mode = propsRef.current.motionMode

        for (const body of bodies) {
            if (body.role !== "dynamic" && body.role !== "pinpush") continue

            if (mode === "zeroGravity") {
                // Gentle random drift
                const angle = Math.random() * Math.PI * 2
                const speed = 20 + Math.random() * 40
                body.vel = vec(
                    Math.cos(angle) * speed,
                    Math.sin(angle) * speed
                )
            } else if (mode === "bounce") {
                // Screensaver-style initial velocity
                const angle = Math.random() * Math.PI * 2
                const speed = 80 + Math.random() * 120
                body.vel = vec(
                    Math.cos(angle) * speed,
                    Math.sin(angle) * speed
                )
            }
            // gravity mode: objects start at rest and fall
        }
    }, [])

    // ── Physics step ────────────────────────────────────────────────────

    const step = useCallback((dt: number) => {
        const pp = propsRef.current
        const bodies = bodiesRef.current
        const bounds = boundsRef.current
        const cursor = cursorRef.current
        const drag = dragRef.current

        if (bodies.length === 0) return

        // Clamp dt to avoid spiral of death
        dt = Math.min(dt, 0.033)

        for (const body of bodies) {
            if (body.role === "static") continue
            if (drag && drag.body === body) continue // skip dragged body

            const isDynamic =
                body.role === "dynamic" ||
                (body.role === "pinpush" && !body.isPinned)

            if (!isDynamic) continue

            // Gravity
            if (pp.motionMode === "gravity") {
                body.vel.y += pp.gravityStrength * dt
            } else if (pp.motionMode === "bounce") {
                // Light downward pull for bounce mode (gives slight arc)
                body.vel.y += pp.gravityStrength * 0.1 * dt
            }

            // Cursor forces
            if (cursor && pp.cursorInfluence !== "off") {
                const bodyCenter = vec(
                    body.home.x + body.pos.x + body.size.x / 2,
                    body.home.y + body.pos.y + body.size.y / 2
                )
                const diff = vsub(bodyCenter, cursor)
                const dist = vlen(diff)

                if (dist < pp.cursorRadius && dist > 1) {
                    const strength =
                        pp.cursorStrength *
                        (1 - dist / pp.cursorRadius) *
                        dt
                    const dir = vnorm(diff)

                    switch (pp.cursorInfluence) {
                        case "nudge": {
                            // Gentle push in cursor movement direction
                            body.vel = vadd(body.vel, vscale(dir, strength * 0.5))
                            break
                        }
                        case "repel": {
                            body.vel = vadd(body.vel, vscale(dir, strength))
                            break
                        }
                        case "attract": {
                            body.vel = vsub(body.vel, vscale(dir, strength))
                            break
                        }
                    }
                }
            }

            // Return-home spring
            if (pp.returnHome) {
                const springForce = vscale(body.pos, -pp.returnStrength)
                body.vel = vadd(body.vel, springForce)
            }

            // Air resistance / damping
            body.vel = vscale(body.vel, 1 - pp.airResistance)

            // Velocity cap
            body.vel = vclamp(body.vel, pp.velocityCap)

            // Integrate position
            body.pos = vadd(body.pos, vscale(body.vel, dt))

            // Bounds containment
            if (pp.boundToContainer) {
                const pad = pp.colliderPadding
                const s = body.expandedSize ?? body.size

                const minX = -(body.home.x) + pad
                const minY = -(body.home.y) + pad
                const maxX = bounds.width - body.home.x - s.x - pad
                const maxY = bounds.height - body.home.y - s.y - pad

                if (body.pos.x < minX) {
                    body.pos.x = minX
                    body.vel.x = Math.abs(body.vel.x) * pp.bounciness
                }
                if (body.pos.x > maxX) {
                    body.pos.x = maxX
                    body.vel.x = -Math.abs(body.vel.x) * pp.bounciness
                }
                if (body.pos.y < minY) {
                    body.pos.y = minY
                    body.vel.y = Math.abs(body.vel.y) * pp.bounciness
                }
                if (body.pos.y > maxY) {
                    body.pos.y = maxY
                    body.vel.y = -Math.abs(body.vel.y) * pp.bounciness
                }
            }
        }

        // Collision detection & resolution
        if (pp.collisionEnabled) {
            for (let iter = 0; iter < pp.collisionIterations; iter++) {
                for (let i = 0; i < bodies.length; i++) {
                    for (let j = i + 1; j < bodies.length; j++) {
                        const a = bodies[i]
                        const b = bodies[j]

                        // Skip if both static or both ignored
                        if (a.role === "static" && b.role === "static") continue

                        const col = detectCollision(a, b)
                        if (col) {
                            resolveCollision(col, pp.bounciness)
                        }
                    }
                }
            }
        }

        // Apply transforms to DOM
        for (const body of bodies) {
            if (body.role === "static") continue

            const dx = Math.round(body.pos.x * 100) / 100
            const dy = Math.round(body.pos.y * 100) / 100

            const base = body.originalTransform
            const translate = `translate(${dx}px, ${dy}px)`
            body.el.style.transform = base
                ? `${base} ${translate}`
                : translate
            body.el.style.willChange = "transform"
        }
    }, [])

    // ── Drag handling ───────────────────────────────────────────────────

    const handlePointerDown = useCallback(
        (e: PointerEvent) => {
            if (!propsRef.current.dragEnabled) return

            const parent = parentRef.current
            if (!parent) return

            const parentRect = parent.getBoundingClientRect()
            const px = e.clientX - parentRect.left
            const py = e.clientY - parentRect.top
            const point = vec(px, py)

            // Hit test: find the topmost dynamic body under cursor
            const bodies = bodiesRef.current
            for (let i = bodies.length - 1; i >= 0; i--) {
                const body = bodies[i]
                if (body.role === "static") continue
                if (body.isPinned) continue

                const r = getBodyRect(body)
                if (
                    px >= r.x &&
                    px <= r.x + r.w &&
                    py >= r.y &&
                    py <= r.y + r.h
                ) {
                    const offset = vsub(
                        point,
                        vec(body.home.x + body.pos.x, body.home.y + body.pos.y)
                    )
                    dragRef.current = {
                        body,
                        offset,
                        history: [{ pos: vec(px, py), time: performance.now() }],
                    }
                    body.vel = vec()
                    e.preventDefault()
                    return
                }
            }
        },
        []
    )

    const handlePointerMove = useCallback((e: PointerEvent) => {
        const parent = parentRef.current
        if (!parent) return

        const parentRect = parent.getBoundingClientRect()
        const px = e.clientX - parentRect.left
        const py = e.clientY - parentRect.top

        // Update cursor position for force effects
        cursorRef.current = vec(px, py)

        // Handle drag
        const drag = dragRef.current
        if (drag) {
            const targetPos = vsub(vec(px, py), drag.offset)
            drag.body.pos = vsub(targetPos, drag.body.home)
            drag.body.vel = vec()

            // Track history for throw velocity
            const now = performance.now()
            drag.history.push({ pos: vec(px, py), time: now })
            if (drag.history.length > 6) drag.history.shift()
        }
    }, [])

    const handlePointerUp = useCallback(() => {
        const drag = dragRef.current
        if (drag && propsRef.current.throwEnabled) {
            // Compute throw velocity from recent pointer history
            const hist = drag.history
            if (hist.length >= 2) {
                const recent = hist[hist.length - 1]
                const older = hist[Math.max(0, hist.length - 3)]
                const dt = (recent.time - older.time) / 1000
                if (dt > 0.001) {
                    const throwVel = vscale(
                        vsub(recent.pos, older.pos),
                        propsRef.current.throwStrength / dt
                    )
                    drag.body.vel = vclamp(
                        throwVel,
                        propsRef.current.velocityCap
                    )
                }
            }
        }
        dragRef.current = null
    }, [])

    const handlePointerLeave = useCallback(() => {
        cursorRef.current = null
        if (dragRef.current) {
            handlePointerUp()
        }
    }, [handlePointerUp])

    // ── Pin and Push: hover detection ───────────────────────────────────

    const setupPinPushListeners = useCallback(() => {
        const bodies = bodiesRef.current
        const hovered = hoveredPinPushRef.current

        for (const body of bodies) {
            if (body.role !== "pinpush") continue

            const onEnter = () => {
                body.isPinned = true
                hovered.add(body.el)

                // Update size in case hover animation changed it
                const rect = body.el.getBoundingClientRect()
                body.expandedSize = vec(rect.width, rect.height)
            }

            const onLeave = () => {
                body.isPinned = false
                hovered.delete(body.el)
                body.expandedSize = null
            }

            body.el.addEventListener("pointerenter", onEnter)
            body.el.addEventListener("pointerleave", onLeave)

            // Store cleanup refs on the element
            ;(body.el as any).__driftPinCleanup = () => {
                body.el.removeEventListener("pointerenter", onEnter)
                body.el.removeEventListener("pointerleave", onLeave)
            }
        }
    }, [])

    // ── Animation loop ──────────────────────────────────────────────────

    const lastTimeRef = useRef(0)

    const animate = useCallback(
        (time: number) => {
            if (lastTimeRef.current === 0) lastTimeRef.current = time
            const dt = (time - lastTimeRef.current) / 1000
            lastTimeRef.current = time

            step(dt)

            rafRef.current = requestAnimationFrame(animate)
        },
        [step]
    )

    // ── Setup and teardown ──────────────────────────────────────────────

    useEffect(() => {
        // Small delay to ensure Framer has rendered sibling layers
        const timer = setTimeout(() => {
            initBodies()
            applyInitialMotion()
            setupPinPushListeners()

            const parent = parentRef.current
            if (parent) {
                parent.addEventListener("pointerdown", handlePointerDown)
                parent.addEventListener("pointermove", handlePointerMove)
                parent.addEventListener("pointerup", handlePointerUp)
                parent.addEventListener("pointerleave", handlePointerLeave)
            }

            lastTimeRef.current = 0
            rafRef.current = requestAnimationFrame(animate)
        }, 100)

        return () => {
            clearTimeout(timer)
            cancelAnimationFrame(rafRef.current)

            const parent = parentRef.current
            if (parent) {
                parent.removeEventListener("pointerdown", handlePointerDown)
                parent.removeEventListener("pointermove", handlePointerMove)
                parent.removeEventListener("pointerup", handlePointerUp)
                parent.removeEventListener("pointerleave", handlePointerLeave)
            }

            // Reset transforms and clean up pin-push listeners
            for (const body of bodiesRef.current) {
                body.el.style.transform = body.originalTransform || ""
                body.el.style.willChange = ""
                if ((body.el as any).__driftPinCleanup) {
                    ;(body.el as any).__driftPinCleanup()
                    delete (body.el as any).__driftPinCleanup
                }
            }

            bodiesRef.current = []
            initializedRef.current = false
        }
    }, [
        initBodies,
        applyInitialMotion,
        setupPinPushListeners,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        handlePointerLeave,
        animate,
    ])

    // ── ResizeObserver to update bounds ──────────────────────────────────

    useEffect(() => {
        const parent = parentRef.current
        if (!parent) return

        const ro = new ResizeObserver(() => {
            const rect = parent.getBoundingClientRect()
            boundsRef.current = { width: rect.width, height: rect.height }

            // Recalculate home positions
            for (const body of bodiesRef.current) {
                const childRect = body.el.getBoundingClientRect()
                // Temporarily remove our transform to get true home position
                const currentTransform = body.el.style.transform
                body.el.style.transform = body.originalTransform || ""
                const cleanRect = body.el.getBoundingClientRect()
                body.el.style.transform = currentTransform

                body.home = vec(
                    cleanRect.left - rect.left,
                    cleanRect.top - rect.top
                )
                body.size = vec(cleanRect.width, cleanRect.height)
            }
        })

        ro.observe(parent)
        return () => ro.disconnect()
    }, [])

    // ── Debug overlay ───────────────────────────────────────────────────

    const debugOverlay =
        p.debugView || p.showColliderBounds ? (
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    zIndex: 99999,
                }}
            >
                {bodiesRef.current.map((body, i) => {
                    const r = getBodyRect(body)
                    const color =
                        body.role === "static"
                            ? "rgba(255,100,100,0.3)"
                            : body.role === "pinpush"
                            ? "rgba(100,100,255,0.3)"
                            : "rgba(100,255,100,0.2)"

                    return (
                        <div
                            key={i}
                            style={{
                                position: "absolute",
                                left: r.x,
                                top: r.y,
                                width: r.w,
                                height: r.h,
                                border: `1px solid ${color}`,
                                background: color,
                                borderRadius: 2,
                                fontSize: 9,
                                color: "#fff",
                                padding: 2,
                                overflow: "hidden",
                            }}
                        >
                            {p.debugView &&
                                `${body.role} ${getLayerName(body.el) || i}`}
                        </div>
                    )
                })}
            </div>
        ) : null

    // ── Render ───────────────────────────────────────────────────────────

    // Drift is invisible. It renders a zero-size element used as a DOM anchor.
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
        >
            {debugOverlay}
        </div>
    )
}

Drift.displayName = "Drift"

// ─── Property controls ──────────────────────────────────────────────────────

addPropertyControls(Drift, {
    // ── Behavior ────────────────────────────────────────────────────────

    motionMode: {
        type: ControlType.Enum,
        title: "Motion Mode",
        options: ["zeroGravity", "bounce", "gravity"],
        optionTitles: ["Zero Gravity", "Bounce", "Gravity"],
        defaultValue: "zeroGravity",
        description: "How objects move in the scene",
    },
    gravityStrength: {
        type: ControlType.Number,
        title: "Gravity",
        min: 0,
        max: 3000,
        step: 50,
        defaultValue: 800,
        hidden: (props) => props.motionMode === "zeroGravity",
        description: "Downward pull strength",
    },
    bounciness: {
        type: ControlType.Number,
        title: "Bounciness",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.5,
        description: "How much energy is preserved on bounce",
    },
    airResistance: {
        type: ControlType.Number,
        title: "Air Resistance",
        min: 0,
        max: 0.2,
        step: 0.005,
        defaultValue: 0.02,
        description: "Velocity damping per frame",
    },
    velocityCap: {
        type: ControlType.Number,
        title: "Speed Limit",
        min: 100,
        max: 5000,
        step: 100,
        defaultValue: 1500,
        description: "Maximum velocity for any object",
    },
    throwStrength: {
        type: ControlType.Number,
        title: "Throw Strength",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 1.2,
        hidden: (props) => !props.dragEnabled,
        description: "Velocity multiplier when releasing a dragged object",
    },
    boundToContainer: {
        type: ControlType.Boolean,
        title: "Contain in Bounds",
        defaultValue: true,
        description: "Keep objects inside the parent container",
    },

    // ── Interaction ─────────────────────────────────────────────────────

    cursorInfluence: {
        type: ControlType.Enum,
        title: "Cursor Effect",
        options: ["off", "nudge", "repel", "attract"],
        optionTitles: ["Off", "Nudge", "Repel", "Attract"],
        defaultValue: "nudge",
        description: "How the cursor affects nearby objects",
    },
    cursorRadius: {
        type: ControlType.Number,
        title: "Cursor Radius",
        min: 20,
        max: 600,
        step: 10,
        defaultValue: 150,
        hidden: (props) => props.cursorInfluence === "off",
        description: "Influence area around the cursor",
    },
    cursorStrength: {
        type: ControlType.Number,
        title: "Cursor Force",
        min: 50,
        max: 3000,
        step: 50,
        defaultValue: 600,
        hidden: (props) => props.cursorInfluence === "off",
        description: "How strongly the cursor pushes objects",
    },
    dragEnabled: {
        type: ControlType.Boolean,
        title: "Drag",
        defaultValue: true,
        description: "Allow dragging objects with the cursor",
    },
    throwEnabled: {
        type: ControlType.Boolean,
        title: "Throw",
        defaultValue: true,
        hidden: (props) => !props.dragEnabled,
        description: "Objects gain momentum when released",
    },
    returnHome: {
        type: ControlType.Boolean,
        title: "Return Home",
        defaultValue: false,
        description: "Objects spring back toward their starting position",
    },
    returnStrength: {
        type: ControlType.Number,
        title: "Return Strength",
        min: 0.005,
        max: 0.3,
        step: 0.005,
        defaultValue: 0.03,
        hidden: (props) => !props.returnHome,
        description: "Spring force pulling objects home",
    },

    // ── Layer Assignment ────────────────────────────────────────────────

    staticColliders: {
        type: ControlType.String,
        title: "Static Colliders",
        defaultValue: "",
        placeholder: "Layer name, Another name",
        description:
            "Comma-separated layer names. These stay in place but block dynamic objects.",
    },
    ignoredLayers: {
        type: ControlType.String,
        title: "Ignored Layers",
        defaultValue: "",
        placeholder: "Background, Logo",
        description:
            "Comma-separated layer names. These are excluded from the simulation entirely.",
    },
    pinPushLayers: {
        type: ControlType.String,
        title: "Pin & Push",
        defaultValue: "",
        placeholder: "Card, Badge",
        description:
            "Comma-separated layer names. These pin in place on hover and push nearby objects away.",
    },

    // ── Collider ────────────────────────────────────────────────────────

    collisionEnabled: {
        type: ControlType.Boolean,
        title: "Collisions",
        defaultValue: true,
        description: "Enable collision detection between objects",
    },
    collisionIterations: {
        type: ControlType.Number,
        title: "Collision Quality",
        min: 1,
        max: 6,
        step: 1,
        defaultValue: 3,
        hidden: (props) => !props.collisionEnabled,
        description:
            "Higher values give more stable stacking but cost performance",
    },
    colliderPadding: {
        type: ControlType.Number,
        title: "Collider Padding",
        min: -20,
        max: 40,
        step: 1,
        defaultValue: 0,
        description: "Expand or shrink collider bounds",
    },

    // ── Advanced ────────────────────────────────────────────────────────

    debugView: {
        type: ControlType.Boolean,
        title: "Debug View",
        defaultValue: false,
        description: "Show body roles and labels",
    },
    showColliderBounds: {
        type: ControlType.Boolean,
        title: "Show Bounds",
        defaultValue: false,
        description: "Show collider rectangles",
    },
})
