import { addPropertyControls, ControlType } from "framer"
import React, {
    useRef,
    useState,
    useEffect,
    useCallback,
    useMemo,
} from "react"

/*
 * FragmentField — Rotational cascade fragmentation
 *
 * Two rotational attractors create a smooth angular field.
 * Cells subdivide recursively via quadtree: large cells at
 * the field edges break into smaller descendants toward the
 * core. Each child inherits its parent's rotation angle and
 * adds a small angular increment, creating coherent rotational
 * flow with nested scale relationships.
 *
 * The image content inside each cell is CSS-rotated (not offset-
 * shifted), so the effect reads as a turning field, not shifted
 * tiles. Cover-correct background sizing ensures cells show the
 * same image rendering as the base layer.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type Direction =
    | "left" | "right" | "top" | "bottom"
    | "top-left" | "top-right" | "bottom-left" | "bottom-right"

interface Attractor {
    cx: number
    cy: number
    strength: number // radians at center
    radius: number   // normalized falloff radius
    spin: number     // +1 or -1 (CW / CCW)
}

interface CellData {
    id: number
    x: number
    y: number
    w: number
    h: number
    nx: number
    ny: number
    depth: number
    angle: number     // inherited + accumulated rotation (radians)
    zone: "core" | "falloff" | "island"
    activity: number
    phase: number
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sr(seed: number): number {
    const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
}
function sr2(a: number, b: number): number {
    const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
    return x - Math.floor(x)
}
function sr3(a: number, b: number, c: number): number {
    const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
    return x - Math.floor(x)
}
function smoothstep(e0: number, e1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
}

function getDistance(nx: number, ny: number, dir: Direction): number {
    switch (dir) {
        case "left": return nx
        case "right": return 1 - nx
        case "top": return ny
        case "bottom": return 1 - ny
        case "top-left": return Math.sqrt(nx * nx + ny * ny) / Math.SQRT2
        case "top-right": return Math.sqrt((1 - nx) ** 2 + ny ** 2) / Math.SQRT2
        case "bottom-left": return Math.sqrt(nx ** 2 + (1 - ny) ** 2) / Math.SQRT2
        case "bottom-right": return Math.sqrt((1 - nx) ** 2 + (1 - ny) ** 2) / Math.SQRT2
    }
}

// ─── Cover computation ──────────────────────────────────────────────────────

function computeCoverSize(
    imgW: number, imgH: number,
    contW: number, contH: number,
    posX: number, posY: number
): { bgW: number; bgH: number; cropX: number; cropY: number } {
    const imgA = imgW / imgH, contA = contW / contH
    let bgW: number, bgH: number
    if (imgA > contA) { bgH = contH; bgW = contH * imgA }
    else { bgW = contW; bgH = contW / imgA }
    return {
        bgW, bgH,
        cropX: (bgW - contW) * (posX / 100),
        cropY: (bgH - contH) * (posY / 100),
    }
}

// ─── Rotational Attractors ──────────────────────────────────────────────────
// Two attractors create the angular field. Each is a point that
// rotates nearby cells. The angle at any point is the smooth
// blend of attractor influences — this guarantees angular
// coherence between neighbors.

function makeAttractors(
    dir: Direction, coverage: number, falloffWidth: number, rotStr: number
): Attractor[] {
    const covN = coverage / 100
    const fallEnd = covN + falloffWidth / 100

    // Place two attractors within the distortion zone
    // Attractor 1: deeper, stronger, primary rotation
    // Attractor 2: offset laterally, counter-rotation for tension
    const s1 = sr(42), s2 = sr(137)
    const depth1 = 0.25, depth2 = 0.55

    function placeInField(
        depthFrac: number, lateralFrac: number
    ): { cx: number; cy: number } {
        // depthFrac: 0=origin, 1=falloff edge
        // lateralFrac: 0-1 along perpendicular axis
        const d = depthFrac * fallEnd
        switch (dir) {
            case "left": return { cx: d, cy: lateralFrac }
            case "right": return { cx: 1 - d, cy: lateralFrac }
            case "top": return { cx: lateralFrac, cy: d }
            case "bottom": return { cx: lateralFrac, cy: 1 - d }
            case "top-left": return { cx: d * 0.8, cy: d * 0.8 + lateralFrac * (1 - d) }
            case "top-right": return { cx: 1 - d * 0.8, cy: d * 0.8 + lateralFrac * (1 - d) }
            case "bottom-left": return { cx: d * 0.8 + lateralFrac * (1 - d), cy: 1 - d * 0.8 }
            case "bottom-right": return { cx: 1 - d * 0.8, cy: 1 - d * 0.8 }
        }
    }

    const p1 = placeInField(depth1, 0.35 + s1 * 0.3)
    const p2 = placeInField(depth2, 0.25 + s2 * 0.5)

    const baseRad = rotStr * (Math.PI / 180)

    return [
        {
            cx: p1.cx, cy: p1.cy,
            strength: baseRad * 1.2,
            radius: 0.25 + covN * 0.15,
            spin: 1,
        },
        {
            cx: p2.cx, cy: p2.cy,
            strength: baseRad * 0.7,
            radius: 0.18 + covN * 0.1,
            spin: -1,
        },
    ]
}

// Resolve field angle: smooth blend of attractor influences
function getAttractorAngle(
    nx: number, ny: number, attractors: Attractor[]
): number {
    let angle = 0
    for (const a of attractors) {
        const dx = nx - a.cx, dy = ny - a.cy
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d > a.radius * 2) continue

        // Smooth radial falloff from attractor center
        const influence = smoothstep(a.radius * 2, 0, d)

        // Angular component: cells closer to the attractor rotate more
        // Add a tangential twist based on the cell's position relative
        // to the attractor, so it feels like orbiting, not uniform
        const tangentialAngle = Math.atan2(dy, dx)
        const twist = tangentialAngle * 0.15 * influence

        angle += (a.strength * a.spin * influence) + twist
    }
    return angle
}

// ─── Recursive Cell Generation ───────────────────────────────────────────────

function makeCells(
    contW: number, contH: number,
    attractors: Attractor[],
    dir: Direction,
    coverage: number, falloffWidth: number,
    edgeStepping: number, randomness: number,
    cellSize: number, density: number,
    islandDensity: number, islandScatter: number, islandFade: number,
    distStr: number
): CellData[] {
    if (contW <= 0 || contH <= 0) return []

    const covN = coverage / 100
    const fallN = falloffWidth / 100
    const fallEnd = covN + fallN
    const steps = Math.max(1, edgeStepping)

    const startSize = cellSize * 4
    const minSize = Math.max(8, cellSize * 0.45)
    const cells: CellData[] = []
    let cid = 0

    function subdivide(
        x: number, y: number, w: number, h: number,
        depth: number, parentAngle: number
    ) {
        const nx = (x + w / 2) / contW
        const ny = (y + h / 2) / contH
        if (nx < -0.05 || nx > 1.05 || ny < -0.05 || ny > 1.05) return

        const dist = getDistance(nx, ny, dir)
        const fieldDepth = Math.max(0, 1 - dist / Math.max(0.01, fallEnd))

        // ── Angle inheritance ──
        // Get this cell's angle from the attractor field
        const attractorAngle = getAttractorAngle(nx, ny, attractors)
        // Inherit from parent and blend with local attractor influence
        // Deeper children lean more toward the attractor field,
        // shallower cells lean toward their parent's angle
        const inheritBlend = Math.min(1, 0.3 + depth * 0.2)
        const cellAngle = parentAngle * (1 - inheritBlend) + attractorAngle * inheritBlend
            // Add small angular increment per subdivision for fan-out
            + (sr3(x * 0.1, y * 0.1, depth * 13) - 0.5) * 0.08 * (depth + 1)

        // ── Subdivision decision ──
        const halfW = w / 2, halfH = h / 2
        const canSub = halfW >= minSize && halfH >= minSize && depth < 4

        const subThresh = depth === 0 ? 0.08
            : depth === 1 ? 0.28
            : depth === 2 ? 0.50
            : 0.72
        const subSeed = sr3(Math.floor(x * 0.7), Math.floor(y * 0.7), depth * 7)
        const jitter = (subSeed - 0.5) * 0.12

        if (canSub && fieldDepth > subThresh + jitter) {
            // Skip chance: occasional large cells survive in core for variety
            const skipChance = depth === 0 ? 0.03 : depth === 1 ? 0.06 : 0.12
            if (subSeed >= skipChance) {
                subdivide(x, y, halfW, halfH, depth + 1, cellAngle)
                subdivide(x + halfW, y, halfW, halfH, depth + 1, cellAngle)
                subdivide(x, y + halfH, halfW, halfH, depth + 1, cellAngle)
                subdivide(x + halfW, y + halfH, halfW, halfH, depth + 1, cellAngle)
                return
            }
        }

        // ── Emit leaf cell ──
        const seed = sr2(x * 0.1, y * 0.1)
        const jit = (seed - 0.5) * randomness * 0.08

        let zone: CellData["zone"] | "clean" = "clean"
        let activity = 0

        if (dist < covN + jit) {
            zone = "core"
            activity = 1
        } else if (dist < fallEnd + jit) {
            zone = "falloff"
            const t = (dist - covN) / Math.max(0.001, fallN)
            const stepped = Math.floor(t * steps) / steps
            activity = Math.max(0, 1 - stepped)
            if (seed > density * activity) {
                zone = "clean"
                activity = 0
            }
        }

        // Islands
        if (zone === "clean" && dist >= fallEnd && dist < fallEnd + islandScatter / 100) {
            const thresh = 1 - (islandDensity / 100) * 0.18
            const phase = sr3(x * 0.1, y * 0.1, 17)
            if (phase > thresh) {
                zone = "island"
                const id2 = (dist - fallEnd) / (islandScatter / 100)
                activity = Math.max(0, 1 - id2) * (1 - islandFade) * 0.45
            }
        }

        if (zone === "clean" || activity < 0.02) return

        cells.push({
            id: cid++,
            x, y, w, h, nx, ny,
            depth,
            angle: cellAngle * activity * distStr,
            zone: zone as CellData["zone"],
            activity,
            phase: sr3(x * 0.1, y * 0.1, 17),
        })
    }

    // Start recursion
    const startCols = Math.ceil(contW / startSize)
    const startRows = Math.ceil(contH / startSize)
    for (let r = 0; r < startRows; r++) {
        for (let c = 0; c < startCols; c++) {
            const x = c * startSize
            const y = r * startSize
            const w = Math.min(startSize, contW - x)
            const h = Math.min(startSize, contH - y)
            if (w > 4 && h > 4) {
                // Root cells start with zero inherited angle
                subdivide(x, y, w, h, 0, 0)
            }
        }
    }

    return cells
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
    source: string
    mediaType: "image" | "video"
    objectFit: "cover" | "contain" | "fill"
    positionX: number
    positionY: number
    borderRadius: number
    direction: Direction
    coverage: number
    falloffWidth: number
    edgeStepping: number
    randomness: number
    cellSize: number
    density: number
    distortionStrength: number
    cellOpacity: number
    islandDensity: number
    islandScatter: number
    islandFade: number
    ambientMotion: boolean
    motionAmount: number
    drift: number
    flicker: number
    rotationEnabled: boolean
    rotationStrength: number
    hoverEnabled: boolean
    hoverRadius: number
    hoverIntensity: number
    hoverRecovery: number
    contrast: number
    blur: number
    grain: boolean
    width: number
    height: number
}

const defaults: Partial<Props> = {
    source: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=1200&q=80",
    mediaType: "image",
    objectFit: "cover",
    positionX: 50,
    positionY: 50,
    borderRadius: 0,
    direction: "top-right",
    coverage: 42,
    falloffWidth: 24,
    edgeStepping: 5,
    randomness: 0.45,
    cellSize: 28,
    density: 0.92,
    distortionStrength: 1.3,
    cellOpacity: 1,
    islandDensity: 20,
    islandScatter: 14,
    islandFade: 0.4,
    ambientMotion: true,
    motionAmount: 0.25,
    drift: 0.12,
    flicker: 0.03,
    rotationEnabled: true,
    rotationStrength: 14,
    hoverEnabled: true,
    hoverRadius: 110,
    hoverIntensity: 0.5,
    hoverRecovery: 0.05,
    contrast: 0,
    blur: 0,
    grain: false,
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FragmentField(rawProps: Partial<Props>) {
    const p = { ...defaults, ...rawProps } as Props

    if (!p.source) {
        return (
            <div style={{
                width: "100%", height: "100%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "#1a1a1a", color: "#666",
                fontFamily: "Inter, system-ui, sans-serif", fontSize: 14,
                borderRadius: p.borderRadius,
            }}>
                Add an image to begin
            </div>
        )
    }

    const containerRef = useRef<HTMLDivElement>(null)
    const [size, setSize] = useState({ w: 0, h: 0 })
    const [imgDims, setImgDims] = useState({ w: 0, h: 0 })
    const mouseRef = useRef({ x: -9999, y: -9999, on: false })
    const hoverRef = useRef<Map<number, number>>(new Map())
    const tRef = useRef(0)
    const rafRef = useRef(0)
    const [tick, setTick] = useState(0)

    useEffect(() => {
        if (p.mediaType !== "image") return
        const img = new Image()
        img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight })
        img.src = p.source
    }, [p.source, p.mediaType])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const obs = new ResizeObserver((e) => {
            const { width, height } = e[0].contentRect
            if (width > 0 && height > 0) setSize({ w: width, h: height })
        })
        obs.observe(el)
        return () => obs.disconnect()
    }, [])

    const cover = useMemo(() => {
        if (imgDims.w <= 0 || imgDims.h <= 0 || size.w <= 0 || size.h <= 0)
            return { bgW: size.w, bgH: size.h, cropX: 0, cropY: 0 }
        return computeCoverSize(imgDims.w, imgDims.h, size.w, size.h, p.positionX, p.positionY)
    }, [imgDims.w, imgDims.h, size.w, size.h, p.positionX, p.positionY])

    const attractors = useMemo(
        () => makeAttractors(p.direction, p.coverage, p.falloffWidth, p.rotationStrength),
        [p.direction, p.coverage, p.falloffWidth, p.rotationStrength]
    )

    const cells = useMemo(
        () => makeCells(
            size.w, size.h, attractors, p.direction,
            p.coverage, p.falloffWidth, p.edgeStepping, p.randomness,
            p.cellSize, p.density,
            p.islandDensity, p.islandScatter, p.islandFade,
            p.distortionStrength
        ),
        [size.w, size.h, attractors, p.direction, p.coverage, p.falloffWidth,
         p.edgeStepping, p.randomness, p.cellSize, p.density,
         p.islandDensity, p.islandScatter, p.islandFade, p.distortionStrength]
    )

    const onMM = useCallback((e: React.MouseEvent) => {
        if (!p.hoverEnabled) return
        const r = containerRef.current?.getBoundingClientRect()
        if (!r) return
        mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top, on: true }
    }, [p.hoverEnabled])

    const onML = useCallback(() => {
        mouseRef.current = { ...mouseRef.current, on: false }
    }, [])

    useEffect(() => {
        if (!p.ambientMotion && !p.hoverEnabled) return
        let last = performance.now()
        const loop = (now: number) => {
            const dt = Math.min((now - last) / 1000, 0.1)
            last = now
            tRef.current += dt
            if (p.hoverEnabled) {
                const m = hoverRef.current
                for (const [k, v] of m.entries()) {
                    if (!mouseRef.current.on) {
                        const nv = v * (1 - p.hoverRecovery)
                        if (nv < 0.01) m.delete(k); else m.set(k, nv)
                    }
                }
            }
            setTick((t) => t + 1)
            rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(rafRef.current)
    }, [p.ambientMotion, p.hoverEnabled, p.hoverRecovery])

    if (p.hoverEnabled && mouseRef.current.on && size.w > 0) {
        const mx = mouseRef.current.x, my = mouseRef.current.y, r = p.hoverRadius
        for (const c of cells) {
            const cx = c.x + c.w / 2, cy = c.y + c.h / 2
            const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)
            if (d < r) {
                const inf = smoothstep(r, r * 0.15, d) * p.hoverIntensity
                const cur = hoverRef.current.get(c.id) || 0
                hoverRef.current.set(c.id, Math.max(cur, inf))
            }
        }
    }

    const time = tRef.current
    const cW = size.w, cH = size.h
    const { bgW, bgH, cropX, cropY } = cover

    const renderData = useMemo(() => {
        if (cW <= 0 || cH <= 0) return []

        return cells.map((c) => {
            const hInf = hoverRef.current.get(c.id) || 0
            const act = Math.min(1, c.activity + hInf * 0.5)

            // ── Rotation angle ──
            let angle = p.rotationEnabled ? c.angle : 0

            // Ambient: gentle angular oscillation
            if (p.ambientMotion && act > 0.05) {
                const a = p.motionAmount * act
                const s = p.drift
                angle += Math.sin(
                    time * s * 0.3 + c.nx * Math.PI * 1.2 + c.ny * 0.7
                ) * a * 0.04 * p.distortionStrength
            }

            // Hover: intensify rotation near cursor
            if (hInf > 0) {
                angle *= 1 + hInf * 0.6
            }

            const angleDeg = angle * (180 / Math.PI)

            // ── Background position (cover-correct, no displacement) ──
            // The rotation IS the distortion — no sample offset needed
            const bgX = -(c.x + cropX)
            const bgY = -(c.y + cropY)

            // ── Inner div expansion to prevent gap artifacts ──
            // When the content rotates, corners extend beyond the cell.
            // Expand the inner div so the rotated image still fills the cell.
            const absAngle = Math.abs(angle)
            const sinA = Math.sin(absAngle), cosA = Math.cos(absAngle)
            // Bounding box of rotated rectangle
            const expandX = (c.w * cosA + c.h * sinA - c.w) / 2 + 2
            const expandY = (c.w * sinA + c.h * cosA - c.h) / 2 + 2

            // Opacity
            let op = p.cellOpacity
            if (c.zone === "island") op *= 0.6 * act
            if (p.ambientMotion && p.flicker > 0) {
                op += Math.sin(time * 1.5 + c.phase * Math.PI * 6) * p.flicker * 0.04
                op = Math.max(0.1, Math.min(1, op))
            }

            // Filters
            let filter: string | undefined
            const fl: string[] = []
            if (p.contrast !== 0) fl.push(`contrast(${1 + p.contrast * act * 0.01})`)
            if (p.blur > 0) fl.push(`blur(${p.blur * act * 0.25}px)`)
            if (fl.length) filter = fl.join(" ")

            return { c, bgX, bgY, angleDeg, expandX, expandY, op, filter }
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cells, tick, p, cW, cH, bgW, bgH, cropX, cropY])

    const objPos = `${p.positionX}% ${p.positionY}%`

    return (
        <div
            ref={containerRef}
            onMouseMove={onMM}
            onMouseLeave={onML}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                borderRadius: p.borderRadius,
            }}
        >
            {/* Base media */}
            {p.mediaType === "image" ? (
                <img src={p.source} alt="" style={{
                    position: "absolute", inset: 0,
                    width: "100%", height: "100%",
                    objectFit: p.objectFit, objectPosition: objPos,
                    display: "block",
                }} />
            ) : (
                <video src={p.source} autoPlay loop muted playsInline style={{
                    position: "absolute", inset: 0,
                    width: "100%", height: "100%",
                    objectFit: p.objectFit, objectPosition: objPos,
                    display: "block",
                }} />
            )}

            {/* Fragment field — rotated image content inside stable cell frames */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {renderData.map((d) => (
                    <div
                        key={d.c.id}
                        style={{
                            // Outer: stable grid-aligned frame, clips rotated content
                            position: "absolute",
                            left: d.c.x,
                            top: d.c.y,
                            width: d.c.w,
                            height: d.c.h,
                            overflow: "hidden",
                            opacity: d.op,
                        }}
                    >
                        {/* Inner: expanded + rotated image content */}
                        <div style={{
                            position: "absolute",
                            left: -d.expandX,
                            top: -d.expandY,
                            width: d.c.w + d.expandX * 2,
                            height: d.c.h + d.expandY * 2,
                            backgroundImage: `url(${p.source})`,
                            backgroundSize: `${bgW}px ${bgH}px`,
                            backgroundPosition: `${d.bgX - d.expandX}px ${d.bgY - d.expandY}px`,
                            backgroundRepeat: "no-repeat",
                            transform: `rotate(${d.angleDeg}deg)`,
                            transformOrigin: "center center",
                            filter: d.filter,
                        }} />
                    </div>
                ))}
            </div>

            {/* Grain */}
            {p.grain && (
                <div style={{
                    position: "absolute", inset: 0, pointerEvents: "none",
                    opacity: 0.05, mixBlendMode: "overlay",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "repeat",
                }} />
            )}
        </div>
    )
}

// ─── Property Controls ───────────────────────────────────────────────────────

addPropertyControls(FragmentField, {
    source: { type: ControlType.Image, title: "Source" },
    mediaType: {
        type: ControlType.Enum, title: "Media Type",
        options: ["image", "video"], optionTitles: ["Image", "Video"],
        defaultValue: "image",
    },
    objectFit: {
        type: ControlType.Enum, title: "Object Fit",
        options: ["cover", "contain", "fill"],
        optionTitles: ["Cover", "Contain", "Fill"],
        defaultValue: "cover",
    },
    positionX: {
        type: ControlType.Number, title: "Position X",
        min: 0, max: 100, unit: "%", defaultValue: 50,
    },
    positionY: {
        type: ControlType.Number, title: "Position Y",
        min: 0, max: 100, unit: "%", defaultValue: 50,
    },
    borderRadius: {
        type: ControlType.Number, title: "Border Radius",
        min: 0, max: 100, defaultValue: 0,
    },
    direction: {
        type: ControlType.Enum, title: "Direction",
        options: ["left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"],
        optionTitles: ["Left", "Right", "Top", "Bottom", "Top-Left", "Top-Right", "Bottom-Left", "Bottom-Right"],
        defaultValue: "top-right",
    },
    coverage: {
        type: ControlType.Number, title: "Coverage",
        min: 5, max: 85, step: 1, unit: "%", defaultValue: 42,
    },
    falloffWidth: {
        type: ControlType.Number, title: "Falloff Width",
        min: 0, max: 50, step: 1, unit: "%", defaultValue: 24,
    },
    edgeStepping: {
        type: ControlType.Number, title: "Edge Stepping",
        min: 2, max: 12, step: 1, defaultValue: 5,
    },
    randomness: {
        type: ControlType.Number, title: "Randomness",
        min: 0, max: 1, step: 0.05, defaultValue: 0.45,
    },
    cellSize: {
        type: ControlType.Number, title: "Cell Size",
        min: 12, max: 80, step: 2, unit: "px", defaultValue: 28,
    },
    density: {
        type: ControlType.Number, title: "Density",
        min: 0.2, max: 1, step: 0.05, defaultValue: 0.92,
    },
    distortionStrength: {
        type: ControlType.Number, title: "Distortion",
        min: 0, max: 4, step: 0.1, defaultValue: 1.3,
    },
    cellOpacity: {
        type: ControlType.Number, title: "Opacity",
        min: 0.2, max: 1, step: 0.05, defaultValue: 1,
    },
    islandDensity: {
        type: ControlType.Number, title: "Island Density",
        min: 0, max: 80, step: 1, unit: "%", defaultValue: 20,
    },
    islandScatter: {
        type: ControlType.Number, title: "Island Scatter",
        min: 0, max: 40, step: 1, unit: "%", defaultValue: 14,
    },
    islandFade: {
        type: ControlType.Number, title: "Island Fade",
        min: 0, max: 1, step: 0.05, defaultValue: 0.4,
    },
    ambientMotion: {
        type: ControlType.Boolean, title: "Ambient Motion", defaultValue: true,
    },
    motionAmount: {
        type: ControlType.Number, title: "Motion Amount",
        min: 0, max: 2, step: 0.05, defaultValue: 0.25,
        hidden: (pp) => !pp.ambientMotion,
    },
    drift: {
        type: ControlType.Number, title: "Drift",
        min: 0, max: 2, step: 0.05, defaultValue: 0.12,
        hidden: (pp) => !pp.ambientMotion,
    },
    flicker: {
        type: ControlType.Number, title: "Flicker",
        min: 0, max: 1, step: 0.05, defaultValue: 0.03,
        hidden: (pp) => !pp.ambientMotion,
    },
    rotationEnabled: {
        type: ControlType.Boolean, title: "Rotation", defaultValue: true,
    },
    rotationStrength: {
        type: ControlType.Number, title: "Rotation Strength",
        min: 0, max: 45, step: 1, unit: "°", defaultValue: 14,
        hidden: (pp) => !pp.rotationEnabled,
    },
    hoverEnabled: {
        type: ControlType.Boolean, title: "Hover Reactive", defaultValue: true,
    },
    hoverRadius: {
        type: ControlType.Number, title: "Hover Radius",
        min: 30, max: 300, step: 5, unit: "px", defaultValue: 110,
        hidden: (pp) => !pp.hoverEnabled,
    },
    hoverIntensity: {
        type: ControlType.Number, title: "Hover Intensity",
        min: 0, max: 1, step: 0.05, defaultValue: 0.5,
        hidden: (pp) => !pp.hoverEnabled,
    },
    hoverRecovery: {
        type: ControlType.Number, title: "Hover Recovery",
        min: 0.01, max: 0.2, step: 0.01, defaultValue: 0.05,
        hidden: (pp) => !pp.hoverEnabled,
    },
    contrast: {
        type: ControlType.Number, title: "Contrast",
        min: -50, max: 50, step: 1, defaultValue: 0,
    },
    blur: {
        type: ControlType.Number, title: "Blur",
        min: 0, max: 8, step: 0.5, unit: "px", defaultValue: 0,
    },
    grain: {
        type: ControlType.Boolean, title: "Grain", defaultValue: false,
    },
})
