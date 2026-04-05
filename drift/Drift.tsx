// Drift — Invisible physics behavior layer for Framer
// Drop into a parent container to activate interactive motion on its direct child layers.
// Supports full rotation physics and OBB (oriented bounding box) collision via SAT.

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
const vcross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
const vclamp = (v: Vec2, max: number): Vec2 => {
    const l = vlen(v)
    return l > max ? vscale(vnorm(v), max) : v
}
// Perpendicular: rotate 90 degrees
const vperp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x })

// ─── Transform parsing ─────────────────────────────────────────────────────

/** Extract rotation angle (radians) from a CSS transform matrix string */
function parseRotation(transform: string): number {
    if (!transform || transform === "none") return 0
    // matrix(a, b, c, d, tx, ty) — angle = atan2(b, a)
    const match = transform.match(
        /matrix\(\s*([^,]+),\s*([^,]+),\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^)]+\)/
    )
    if (match) {
        const a = parseFloat(match[1])
        const b = parseFloat(match[2])
        return Math.atan2(b, a)
    }
    // Try rotate(Xdeg) or rotate(Xrad)
    const rotMatch = transform.match(/rotate\(\s*([^)]+)\)/)
    if (rotMatch) {
        const val = rotMatch[1].trim()
        if (val.endsWith("rad")) return parseFloat(val)
        return (parseFloat(val) * Math.PI) / 180
    }
    return 0
}

// ─── Body types ─────────────────────────────────────────────────────────────

type BodyRole = "dynamic" | "static" | "ignored" | "pinpush"

interface Body {
    el: HTMLElement
    role: BodyRole

    // Positions are CENTER-based, relative to parent top-left
    homeCenter: Vec2 // authored center in parent space
    pos: Vec2 // delta offset from homeCenter
    vel: Vec2

    // Unrotated dimensions (from offsetWidth/offsetHeight)
    halfW: number
    halfH: number

    // Rotation
    homeAngle: number // authored rotation (radians), from CSS transform
    angularPos: number // delta rotation from homeAngle
    angularVel: number // radians per second

    // Physics
    mass: number
    inertia: number // moment of inertia
    restitution: number

    // Sleep & resting contact system
    sleeping: boolean
    sleepCounter: number // frames below sleep threshold
    contactNormal: Vec2 | null // normal of resting contact (for gravity cancellation)

    // State
    originalTransform: string
    isPinned: boolean
    expandedHalfW: number | null
    expandedHalfH: number | null
}

interface Bounds {
    width: number
    height: number
}

// ─── OBB collision via Separating Axis Theorem ──────────────────────────────

/** Get the 4 corners of an oriented bounding box */
function getOBBCorners(
    cx: number,
    cy: number,
    hw: number,
    hh: number,
    angle: number
): Vec2[] {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    return [
        vec(cx - cos * hw + sin * hh, cy - sin * hw - cos * hh),
        vec(cx + cos * hw + sin * hh, cy + sin * hw - cos * hh),
        vec(cx + cos * hw - sin * hh, cy + sin * hw + cos * hh),
        vec(cx - cos * hw - sin * hh, cy - sin * hw + cos * hh),
    ]
}

/** Get the 2 edge-normal axes of an OBB */
function getOBBAxes(angle: number): [Vec2, Vec2] {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    return [vec(cos, sin), vec(-sin, cos)]
}

/** Project corners onto an axis, return [min, max] */
function projectOnAxis(corners: Vec2[], axis: Vec2): [number, number] {
    let min = Infinity
    let max = -Infinity
    for (const c of corners) {
        const p = vdot(c, axis)
        if (p < min) min = p
        if (p > max) max = p
    }
    return [min, max]
}

function getBodyCenter(body: Body): Vec2 {
    return vadd(body.homeCenter, body.pos)
}

function getBodyAngle(body: Body): number {
    return body.homeAngle + body.angularPos
}

function getBodyHalfSize(body: Body): [number, number] {
    return [
        body.expandedHalfW ?? body.halfW,
        body.expandedHalfH ?? body.halfH,
    ]
}

interface SATResult {
    normal: Vec2 // from A toward B
    overlap: number
    contactPoint: Vec2
}

function satTest(a: Body, b: Body, padding: number): SATResult | null {
    const ca = getBodyCenter(a)
    const cb = getBodyCenter(b)
    const angleA = getBodyAngle(a)
    const angleB = getBodyAngle(b)
    const [hwA, hhA] = getBodyHalfSize(a)
    const [hwB, hhB] = getBodyHalfSize(b)

    const cornersA = getOBBCorners(ca.x, ca.y, hwA + padding, hhA + padding, angleA)
    const cornersB = getOBBCorners(cb.x, cb.y, hwB + padding, hhB + padding, angleB)

    const axesA = getOBBAxes(angleA)
    const axesB = getOBBAxes(angleB)
    const axes = [axesA[0], axesA[1], axesB[0], axesB[1]]

    let minOverlap = Infinity
    let minAxis = vec()

    for (const axis of axes) {
        const [minA, maxA] = projectOnAxis(cornersA, axis)
        const [minB, maxB] = projectOnAxis(cornersB, axis)
        const overlap = Math.min(maxA, maxB) - Math.max(minA, minB)

        if (overlap <= 0) return null // separating axis found — no collision

        if (overlap < minOverlap) {
            minOverlap = overlap
            minAxis = axis
        }
    }

    // Ensure normal points from A toward B
    const d = vsub(cb, ca)
    if (vdot(d, minAxis) < 0) {
        minAxis = vscale(minAxis, -1)
    }

    // Contact point: project from A's center toward B along collision normal,
    // landing on A's surface. hwA/hhA/hwB/hhB already declared above.
    const depthA = hwA * Math.abs(minAxis.x) + hhA * Math.abs(minAxis.y)
    const contactPoint = vadd(ca, vscale(minAxis, depthA - minOverlap * 0.5))

    return { normal: minAxis, overlap: minOverlap, contactPoint }
}

function resolveCollision(
    a: Body,
    b: Body,
    sat: SATResult,
    restitution: number,
    stickiness: number = 0
) {
    const aStatic = a.role === "static" || a.isPinned
    const bStatic = b.role === "static" || b.isPinned
    if (aStatic && bStatic) return

    const { normal, overlap, contactPoint } = sat
    const ca = getBodyCenter(a)
    const cb = getBodyCenter(b)

    // ── Positional correction ──
    const invMassA = aStatic ? 0 : 1 / a.mass
    const invMassB = bStatic ? 0 : 1 / b.mass
    const invInertiaA = aStatic ? 0 : 1 / a.inertia
    const invInertiaB = bStatic ? 0 : 1 / b.inertia
    const totalInvMass = invMassA + invMassB

    if (totalInvMass === 0) return

    // Positional correction with slop tolerance to prevent jitter.
    // Only correct penetration beyond the slop threshold, and apply
    // gradually (Baumgarte stabilization) instead of full correction.
    const slop = 0.5 // allow up to 0.5px overlap without correction
    const baumgarte = 0.4 // correct 40% of penetration per iteration
    const correctionMag = Math.max(overlap - slop, 0) * baumgarte
    if (correctionMag > 0) {
        if (!aStatic) {
            a.pos = vsub(a.pos, vscale(normal, correctionMag * (invMassA / totalInvMass)))
        }
        if (!bStatic) {
            b.pos = vadd(b.pos, vscale(normal, correctionMag * (invMassB / totalInvMass)))
        }
    }

    // ── Velocity + angular impulse resolution ──
    const rA = vsub(contactPoint, ca)
    const rB = vsub(contactPoint, cb)

    const velA = aStatic
        ? vec()
        : vadd(a.vel, vscale(vperp(rA), a.angularVel))
    const velB = bStatic
        ? vec()
        : vadd(b.vel, vscale(vperp(rB), b.angularVel))

    const relVel = vsub(velA, velB)
    const velAlongNormal = vdot(relVel, normal)

    if (velAlongNormal > 0) return

    const rACrossN = vcross(rA, normal)
    const rBCrossN = vcross(rB, normal)
    const effectiveMass =
        invMassA +
        invMassB +
        rACrossN * rACrossN * invInertiaA +
        rBCrossN * rBCrossN * invInertiaB

    if (effectiveMass === 0) return

    // Kill restitution at low velocities to prevent micro-bouncing
    const e = Math.abs(velAlongNormal) < 40 ? 0 : restitution
    const j = -(1 + e) * velAlongNormal / effectiveMass

    const impulse = vscale(normal, j)

    if (!aStatic) {
        a.vel = vadd(a.vel, vscale(impulse, invMassA))
        a.angularVel += vcross(rA, impulse) * invInertiaA
    }
    if (!bStatic) {
        b.vel = vsub(b.vel, vscale(impulse, invMassB))
        b.angularVel -= vcross(rB, impulse) * invInertiaB
    }

    // ── Friction impulse (tangential) ──
    // Stickiness boosts contact friction from 0.3 up to 0.95
    const tangent = vnorm(vsub(relVel, vscale(normal, velAlongNormal)))
    const velAlongTangent = vdot(relVel, tangent)
    const frictionCoeff = 0.3 + stickiness * 0.65

    const tEffectiveMass =
        invMassA +
        invMassB +
        vcross(rA, tangent) ** 2 * invInertiaA +
        vcross(rB, tangent) ** 2 * invInertiaB

    if (tEffectiveMass > 0) {
        let jt = -velAlongTangent / tEffectiveMass
        // Coulomb friction clamp
        jt = Math.max(-Math.abs(j) * frictionCoeff, Math.min(jt, Math.abs(j) * frictionCoeff))

        const frictionImpulse = vscale(tangent, jt)
        if (!aStatic) {
            a.vel = vadd(a.vel, vscale(frictionImpulse, invMassA))
            a.angularVel += vcross(rA, frictionImpulse) * invInertiaA
        }
        if (!bStatic) {
            b.vel = vsub(b.vel, vscale(frictionImpulse, invMassB))
            b.angularVel -= vcross(rB, frictionImpulse) * invInertiaB
        }
    }
}

// ─── Canvas detection ───────────────────────────────────────────────────────

/** Returns true when running on the Framer canvas (editing mode), false in preview/published */
function isFramerCanvas(): boolean {
    if (typeof window === "undefined") return true
    // Framer preview and published sites use a clean URL or localhost preview port.
    // The canvas renders inside an iframe whose URL contains "framercanvas" or
    // has the data attribute on the document element.
    try {
        // Framer canvas sets data-framer-hydrate-v2 or wraps in a specific container
        if (document.querySelector("[data-framer-page-optimized]")) return false
        // In canvas mode the window name or ancestor frame hints at editing
        if (window.name === "FramerCanvas" || window.name === "canvas") return true
        // Framer canvas URLs contain /canvas or the referrer is framer.com editor
        if (window.location.href.includes("/canvas")) return true
        // Check for Framer's canvas-specific wrapper
        if (document.getElementById("__framer-badge-container")) return false
        // Framer preview runs at a specific port or framercanvas is absent
        // Most reliable: Framer injects RenderEnvironment on the window
        if ((window as any).__FRAMER_RENDER_ENVIRONMENT__ === "CANVAS") return true
        // Fallback: check if we're inside the Framer editor iframe structure
        if (window.parent !== window && window.parent.location.href.includes("framer.com")) return true
    } catch {
        // cross-origin access to parent — likely in preview/published
    }
    return false
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

    // Rotation
    rotationEnabled: boolean
    angularDamping: number

    // Stickiness — objects stop sliding when slow enough
    stickiness: number

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
    rotationEnabled: true,
    angularDamping: 0.03,
    stickiness: 0,
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
        offset: Vec2 // offset from body center in parent space
        history: { pos: Vec2; time: number }[]
    } | null>(null)
    const parentRef = useRef<HTMLElement | null>(null)
    const initializedRef = useRef(false)
    const propsRef = useRef(p)
    propsRef.current = p

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

            if (role === "ignored") continue

            // Get the original transform and extract rotation
            const computedTransform = getComputedStyle(child).transform
            const originalTransform =
                computedTransform && computedTransform !== "none"
                    ? computedTransform
                    : ""
            const homeAngle = parseRotation(originalTransform)

            // Use offsetWidth/offsetHeight for UNROTATED dimensions.
            // getBoundingClientRect() inflates the box for rotated elements.
            const w = child.offsetWidth
            const h = child.offsetHeight

            // Center of the bounding rect IS the center of the element
            // (getBoundingClientRect center is correct even for rotated elements)
            const centerX =
                childRect.left + childRect.width / 2 - parentRect.left
            const centerY =
                childRect.top + childRect.height / 2 - parentRect.top

            const mass = 1
            // Moment of inertia for a rectangle: I = m * (w^2 + h^2) / 12
            const inertia = (mass * (w * w + h * h)) / 12

            bodies.push({
                el: child,
                role,
                homeCenter: vec(centerX, centerY),
                pos: vec(),
                vel: vec(),
                halfW: w / 2,
                halfH: h / 2,
                homeAngle,
                angularPos: 0,
                angularVel: 0,
                mass,
                inertia: Math.max(inertia, 100), // minimum inertia to prevent jitter
                restitution: propsRef.current.bounciness,
                originalTransform,
                sleeping: false,
                sleepCounter: 0,
                contactNormal: null,
                isPinned: false,
                expandedHalfW: null,
                expandedHalfH: null,
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
                const angle = Math.random() * Math.PI * 2
                const speed = 20 + Math.random() * 40
                body.vel = vec(Math.cos(angle) * speed, Math.sin(angle) * speed)
                if (propsRef.current.rotationEnabled) {
                    body.angularVel = (Math.random() - 0.5) * 0.5
                }
            } else if (mode === "bounce") {
                const angle = Math.random() * Math.PI * 2
                const speed = 80 + Math.random() * 120
                body.vel = vec(Math.cos(angle) * speed, Math.sin(angle) * speed)
                if (propsRef.current.rotationEnabled) {
                    body.angularVel = (Math.random() - 0.5) * 1.0
                }
            }
        }
    }, [])

    // ── Physics step ────────────────────────────────────────────────────
    //
    // Step order matters for stability:
    //   1. Clear per-frame contact state
    //   2. Apply forces (gravity with contact cancellation, cursor, springs)
    //   3. Damping + stickiness
    //   4. Integrate velocity → position
    //   5. Bounds containment
    //   6. Collision detection + resolution (records contact normals)
    //   7. Sleep evaluation (AFTER collisions, so settled bodies actually sleep)
    //

    const SLEEP_VEL = 6 // px/s — below this for SLEEP_FRAMES → sleep
    const SLEEP_ANG = 0.1 // rad/s
    const SLEEP_FRAMES = 8

    const step = useCallback((dt: number) => {
        const pp = propsRef.current
        const bodies = bodiesRef.current
        const bounds = boundsRef.current
        const cursor = cursorRef.current
        const drag = dragRef.current

        if (bodies.length === 0) return
        dt = Math.min(dt, 0.033)

        // ── Phase 1: Forces + integration ───────────────────────────────
        for (const body of bodies) {
            if (body.role === "static") continue
            if (drag && drag.body === body) {
                body.sleeping = false
                body.sleepCounter = 0
                body.contactNormal = null
                continue
            }

            const isDynamic =
                body.role === "dynamic" ||
                (body.role === "pinpush" && !body.isPinned)
            if (!isDynamic) continue

            // Wake check
            let shouldWake = false
            if (cursor && pp.cursorInfluence !== "off") {
                const center = getBodyCenter(body)
                const dist = vlen(vsub(center, cursor))
                if (dist < pp.cursorRadius) shouldWake = true
            }

            if (body.sleeping && !shouldWake) continue
            if (shouldWake && body.sleeping) {
                body.sleeping = false
                body.sleepCounter = 0
            }

            // Gravity — cancel component along resting contact normal
            let gx = 0
            let gy = 0
            if (pp.motionMode === "gravity") {
                gy = pp.gravityStrength * dt
            } else if (pp.motionMode === "bounce") {
                gy = pp.gravityStrength * 0.1 * dt
            }

            if (gy !== 0 && body.contactNormal) {
                // Project gravity onto contact normal and subtract it
                const gravVec = vec(gx, gy)
                const gravAlongNormal = vdot(gravVec, body.contactNormal)
                if (gravAlongNormal > 0) {
                    // Gravity pushes into the surface — cancel that component
                    const cancelled = vscale(body.contactNormal, gravAlongNormal)
                    gx -= cancelled.x
                    gy -= cancelled.y
                }
            }

            body.vel.x += gx
            body.vel.y += gy

            // Clear contact normal — it will be re-set by this frame's collisions
            body.contactNormal = null

            // Cursor forces
            if (cursor && pp.cursorInfluence !== "off") {
                const center = getBodyCenter(body)
                const diff = vsub(center, cursor)
                const dist = vlen(diff)

                if (dist < pp.cursorRadius && dist > 1) {
                    const strength =
                        pp.cursorStrength * (1 - dist / pp.cursorRadius) * dt
                    const dir = vnorm(diff)

                    switch (pp.cursorInfluence) {
                        case "nudge":
                            body.vel = vadd(body.vel, vscale(dir, strength * 0.5))
                            break
                        case "repel":
                            body.vel = vadd(body.vel, vscale(dir, strength))
                            break
                        case "attract":
                            body.vel = vsub(body.vel, vscale(dir, strength))
                            break
                    }

                    if (pp.rotationEnabled) {
                        const torque = vcross(diff, vscale(dir, strength * 0.1))
                        body.angularVel += torque / body.inertia
                    }
                }
            }

            // Return-home spring
            if (pp.returnHome) {
                body.vel = vadd(body.vel, vscale(body.pos, -pp.returnStrength))
                if (pp.rotationEnabled) {
                    body.angularVel -= body.angularPos * pp.returnStrength * 2
                }
            }

            // Air resistance
            body.vel = vscale(body.vel, 1 - pp.airResistance)
            if (pp.rotationEnabled) {
                body.angularVel *= 1 - pp.angularDamping
            }

            // Stickiness braking
            if (pp.stickiness > 0) {
                const stickyThreshold = pp.stickiness * 80
                const speed = vlen(body.vel)
                if (speed < stickyThreshold && speed > 0) {
                    const brake = pp.stickiness * 0.4
                    body.vel = vscale(body.vel, 1 - brake)
                    if (vlen(body.vel) < 1) body.vel = vec()
                }
                if (pp.rotationEnabled) {
                    const angThresh = stickyThreshold * 0.02
                    if (Math.abs(body.angularVel) < angThresh) {
                        body.angularVel *= 1 - pp.stickiness * 0.4
                        if (Math.abs(body.angularVel) < 0.01) body.angularVel = 0
                    }
                }
            }

            // Velocity cap
            body.vel = vclamp(body.vel, pp.velocityCap)
            if (pp.rotationEnabled) {
                body.angularVel = Math.max(-15, Math.min(body.angularVel, 15))
            }

            // Integrate
            body.pos = vadd(body.pos, vscale(body.vel, dt))
            if (pp.rotationEnabled) {
                body.angularPos += body.angularVel * dt
            }

            // Bounds containment
            if (pp.boundToContainer) {
                const angle = getBodyAngle(body)
                const [hw, hh] = getBodyHalfSize(body)
                const pad = pp.colliderPadding
                const cosA = Math.abs(Math.cos(angle))
                const sinA = Math.abs(Math.sin(angle))
                const aabbHW = hw * cosA + hh * sinA
                const aabbHH = hw * sinA + hh * cosA
                const cx = body.homeCenter.x + body.pos.x
                const cy = body.homeCenter.y + body.pos.y

                if (cx - aabbHW < pad) {
                    body.pos.x = pad + aabbHW - body.homeCenter.x
                    body.vel.x = Math.abs(body.vel.x) * pp.bounciness
                    if (pp.rotationEnabled) body.angularVel *= -0.5
                    body.contactNormal = vec(1, 0) // left wall
                }
                if (cx + aabbHW > bounds.width - pad) {
                    body.pos.x = bounds.width - pad - aabbHW - body.homeCenter.x
                    body.vel.x = -Math.abs(body.vel.x) * pp.bounciness
                    if (pp.rotationEnabled) body.angularVel *= -0.5
                    body.contactNormal = vec(-1, 0) // right wall
                }
                if (cy - aabbHH < pad) {
                    body.pos.y = pad + aabbHH - body.homeCenter.y
                    body.vel.y = Math.abs(body.vel.y) * pp.bounciness
                    if (pp.rotationEnabled) body.angularVel *= -0.5
                    body.contactNormal = vec(0, 1) // ceiling
                }
                if (cy + aabbHH > bounds.height - pad) {
                    body.pos.y = bounds.height - pad - aabbHH - body.homeCenter.y
                    body.vel.y = -Math.abs(body.vel.y) * pp.bounciness
                    if (pp.rotationEnabled) body.angularVel *= -0.5
                    body.contactNormal = vec(0, -1) // floor
                }
            }
        }

        // ── Phase 2: Collision detection + resolution ───────────────────
        if (pp.collisionEnabled) {
            for (let iter = 0; iter < pp.collisionIterations; iter++) {
                for (let i = 0; i < bodies.length; i++) {
                    for (let j = i + 1; j < bodies.length; j++) {
                        const a = bodies[i]
                        const b = bodies[j]
                        if (a.role === "static" && b.role === "static") continue
                        if (a.sleeping && b.sleeping) continue

                        const result = satTest(a, b, pp.colliderPadding)
                        if (result) {
                            // Wake sleeping bodies on real collision
                            if (result.overlap > 1.5) {
                                if (a.sleeping) { a.sleeping = false; a.sleepCounter = 0 }
                                if (b.sleeping) { b.sleeping = false; b.sleepCounter = 0 }
                            }

                            resolveCollision(a, b, result, pp.bounciness, pp.stickiness)

                            // Record contact normals for gravity cancellation next frame.
                            // Normal points from A toward B, so A's contact is -normal, B's is +normal.
                            const aStatic = a.role === "static" || a.isPinned
                            const bStatic = b.role === "static" || b.isPinned
                            if (!aStatic) {
                                a.contactNormal = vscale(result.normal, -1)
                            }
                            if (!bStatic) {
                                b.contactNormal = result.normal
                            }
                        }
                    }
                }
            }
        }

        // ── Phase 3: Sleep evaluation (AFTER collisions) ────────────────
        for (const body of bodies) {
            if (body.role === "static") continue
            if (body.sleeping) continue
            if (drag && drag.body === body) continue

            const isDynamic =
                body.role === "dynamic" ||
                (body.role === "pinpush" && !body.isPinned)
            if (!isDynamic) continue

            const speed = vlen(body.vel)
            const angSpeed = Math.abs(body.angularVel)

            if (speed < SLEEP_VEL && angSpeed < SLEEP_ANG) {
                body.sleepCounter++
                if (body.sleepCounter >= SLEEP_FRAMES) {
                    body.sleeping = true
                    body.vel = vec()
                    body.angularVel = 0
                }
            } else {
                body.sleepCounter = 0
            }
        }

        // ── Phase 4: Apply transforms to DOM ────────────────────────────
        for (const body of bodies) {
            if (body.role === "static") continue

            const dx = Math.round(body.pos.x * 100) / 100
            const dy = Math.round(body.pos.y * 100) / 100

            if (pp.rotationEnabled && body.angularPos !== 0) {
                const dAngleDeg =
                    Math.round(((body.angularPos * 180) / Math.PI) * 100) / 100
                // Compose: translate in parent space, then original transform, then local rotation
                // CSS transforms apply right-to-left:
                //   rotate(dAngle) — local spin delta
                //   originalTransform — authored position + rotation
                //   translate(dx, dy) — displacement in parent space (outermost = applied last)
                body.el.style.transform = body.originalTransform
                    ? `translate(${dx}px, ${dy}px) ${body.originalTransform} rotate(${dAngleDeg}deg)`
                    : `translate(${dx}px, ${dy}px) rotate(${dAngleDeg}deg)`
            } else {
                body.el.style.transform = body.originalTransform
                    ? `translate(${dx}px, ${dy}px) ${body.originalTransform}`
                    : `translate(${dx}px, ${dy}px)`
            }
            body.el.style.willChange = "transform"
        }
    }, [])

    // ── Drag handling ───────────────────────────────────────────────────

    const handlePointerDown = useCallback((e: PointerEvent) => {
        if (!propsRef.current.dragEnabled) return

        const parent = parentRef.current
        if (!parent) return

        const parentRect = parent.getBoundingClientRect()
        const px = e.clientX - parentRect.left
        const py = e.clientY - parentRect.top
        const point = vec(px, py)

        // Hit test using OBB: check if point is inside the rotated body
        const bodies = bodiesRef.current
        for (let i = bodies.length - 1; i >= 0; i--) {
            const body = bodies[i]
            if (body.role === "static") continue
            if (body.isPinned) continue

            const center = getBodyCenter(body)
            const angle = getBodyAngle(body)
            const [hw, hh] = getBodyHalfSize(body)

            // Transform point into body's local coordinate system
            const local = vsub(point, center)
            const cos = Math.cos(-angle)
            const sin = Math.sin(-angle)
            const lx = local.x * cos - local.y * sin
            const ly = local.x * sin + local.y * cos

            if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) {
                // Offset from body center (in parent space) — used for torque on throw
                const offset = vsub(point, center)
                dragRef.current = {
                    body,
                    offset,
                    history: [{ pos: vec(px, py), time: performance.now() }],
                }
                body.vel = vec()
                body.angularVel = 0
                body.sleeping = false
                body.sleepCounter = 0
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

        cursorRef.current = vec(px, py)

        const drag = dragRef.current
        if (drag) {
            const targetCenter = vsub(vec(px, py), drag.offset)
            drag.body.pos = vsub(targetCenter, drag.body.homeCenter)
            drag.body.vel = vec()

            const now = performance.now()
            drag.history.push({ pos: vec(px, py), time: now })
            if (drag.history.length > 6) drag.history.shift()
        }
    }, [])

    const handlePointerUp = useCallback(() => {
        const drag = dragRef.current
        if (drag && propsRef.current.throwEnabled) {
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
                    drag.body.vel = vclamp(throwVel, propsRef.current.velocityCap)

                    // Torque from off-center grab:
                    // cross product of grab offset and throw velocity
                    if (propsRef.current.rotationEnabled) {
                        const torque = vcross(drag.offset, throwVel)
                        drag.body.angularVel += torque / drag.body.inertia * 0.3
                    }
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
                const rect = body.el.getBoundingClientRect()
                body.expandedHalfW = body.el.offsetWidth / 2
                body.expandedHalfH = body.el.offsetHeight / 2
            }

            const onLeave = () => {
                body.isPinned = false
                hovered.delete(body.el)
                body.expandedHalfW = null
                body.expandedHalfH = null
            }

            body.el.addEventListener("pointerenter", onEnter)
            body.el.addEventListener("pointerleave", onLeave)

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
        // Don't run simulation on the Framer canvas — only in preview/published
        if (isFramerCanvas()) return

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

    // ── ResizeObserver ──────────────────────────────────────────────────

    useEffect(() => {
        const parent = parentRef.current
        if (!parent) return

        const ro = new ResizeObserver(() => {
            const rect = parent.getBoundingClientRect()
            boundsRef.current = { width: rect.width, height: rect.height }

            for (const body of bodiesRef.current) {
                // Temporarily reset to get clean measurements
                const current = body.el.style.transform
                body.el.style.transform = body.originalTransform || ""

                const childRect = body.el.getBoundingClientRect()
                body.homeCenter = vec(
                    childRect.left + childRect.width / 2 - rect.left,
                    childRect.top + childRect.height / 2 - rect.top
                )
                body.halfW = body.el.offsetWidth / 2
                body.halfH = body.el.offsetHeight / 2
                body.inertia = Math.max(
                    (body.mass *
                        (body.halfW * 2) ** 2 +
                        (body.halfH * 2) ** 2) /
                        12,
                    100
                )

                body.el.style.transform = current
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
                    const center = getBodyCenter(body)
                    const angle = getBodyAngle(body)
                    const [hw, hh] = getBodyHalfSize(body)
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
                                left: center.x - hw,
                                top: center.y - hh,
                                width: hw * 2,
                                height: hh * 2,
                                border: `1px solid ${color}`,
                                background: color,
                                transform: `rotate(${(angle * 180) / Math.PI}deg)`,
                                transformOrigin: "center center",
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
        description: "Energy preserved on bounce",
    },
    airResistance: {
        type: ControlType.Number,
        title: "Air Resistance",
        min: 0,
        max: 0.2,
        step: 0.005,
        defaultValue: 0.02,
        description: "Linear velocity damping",
    },
    velocityCap: {
        type: ControlType.Number,
        title: "Speed Limit",
        min: 100,
        max: 5000,
        step: 100,
        defaultValue: 1500,
        description: "Maximum velocity",
    },
    throwStrength: {
        type: ControlType.Number,
        title: "Throw Strength",
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 1.2,
        hidden: (props) => !props.dragEnabled,
        description: "Velocity multiplier on release",
    },
    boundToContainer: {
        type: ControlType.Boolean,
        title: "Contain in Bounds",
        defaultValue: true,
        description: "Keep objects inside the parent",
    },

    // ── Rotation ────────────────────────────────────────────────────────

    rotationEnabled: {
        type: ControlType.Boolean,
        title: "Rotation",
        defaultValue: true,
        description: "Allow objects to spin from collisions and throws",
    },
    angularDamping: {
        type: ControlType.Number,
        title: "Rotation Damping",
        min: 0,
        max: 0.2,
        step: 0.005,
        defaultValue: 0.03,
        hidden: (props) => !props.rotationEnabled,
        description: "How quickly rotation slows down",
    },

    // ── Stickiness ──────────────────────────────────────────────────────

    stickiness: {
        type: ControlType.Number,
        title: "Stickiness",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0,
        description:
            "How quickly objects come to rest. 0 = frictionless sliding, 1 = stop quickly.",
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
        description: "Push strength",
    },
    dragEnabled: {
        type: ControlType.Boolean,
        title: "Drag",
        defaultValue: true,
        description: "Allow dragging objects",
    },
    throwEnabled: {
        type: ControlType.Boolean,
        title: "Throw",
        defaultValue: true,
        hidden: (props) => !props.dragEnabled,
        description: "Objects gain momentum on release",
    },
    returnHome: {
        type: ControlType.Boolean,
        title: "Return Home",
        defaultValue: false,
        description: "Spring back to starting position and rotation",
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
        description: "Stay in place, block dynamic objects",
    },
    ignoredLayers: {
        type: ControlType.String,
        title: "Ignored Layers",
        defaultValue: "",
        placeholder: "Background, Logo",
        description: "Excluded from simulation entirely",
    },
    pinPushLayers: {
        type: ControlType.String,
        title: "Pin & Push",
        defaultValue: "",
        placeholder: "Card, Badge",
        description: "Pin on hover and push nearby objects",
    },

    // ── Collider ────────────────────────────────────────────────────────

    collisionEnabled: {
        type: ControlType.Boolean,
        title: "Collisions",
        defaultValue: true,
        description: "Enable collision detection",
    },
    collisionIterations: {
        type: ControlType.Number,
        title: "Collision Quality",
        min: 1,
        max: 6,
        step: 1,
        defaultValue: 3,
        hidden: (props) => !props.collisionEnabled,
        description: "Stability vs performance tradeoff",
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
        description: "Show oriented collider rectangles",
    },
})
