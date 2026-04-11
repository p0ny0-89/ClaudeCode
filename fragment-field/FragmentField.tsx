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
 * Visual model:
 * A rotational field defines a smooth angular flow across the
 * distortion zone. Cells subdivide recursively: large parent cells
 * at the field edges break into smaller descendants toward the core.
 * Each cell's image sample is displaced by rotating its source
 * position around a pivot by the local field angle. Because the
 * field is continuous, neighboring cells inherit related angles,
 * creating coherent rotational drift rather than random offsets.
 *
 * Architecture:
 * - Vortex centers define the rotational field (replacing linear clusters)
 * - Quadtree subdivision creates recursive nesting (large → small)
 * - Field angle determines sample displacement (not random per-cell)
 * - Single div per cell, full opacity, cover-correct sizing
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type Direction =
    | "left" | "right" | "top" | "bottom"
    | "top-left" | "top-right" | "bottom-left" | "bottom-right"

interface Vortex {
    cx: number     // normalized center
    cy: number
    angle: number  // radians: base rotation at center
    radius: number // normalized influence radius
    strength: number
}

interface CellData {
    id: number
    x: number
    y: number
    w: number
    h: number
    nx: number
    ny: number
    depth: number  // recursion depth (0=largest, higher=smaller)
    fieldAngle: number
    zone: "core" | "falloff" | "island"
    activity: number
    sampleX: number
    sampleY: number
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

function getDirAngle(dir: Direction): number {
    // Returns a base sweep angle aligned with the field direction
    switch (dir) {
        case "left": return 0
        case "right": return Math.PI
        case "top": return Math.PI / 2
        case "bottom": return -Math.PI / 2
        case "top-left": return Math.PI / 4
        case "top-right": return 3 * Math.PI / 4
        case "bottom-left": return -Math.PI / 4
        case "bottom-right": return -3 * Math.PI / 4
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

// ─── Rotational Vortex Field ─────────────────────────────────────────────────
// Vortices create a smooth rotational field. Each vortex defines an
// angular influence that sweeps gradually across space. Neighboring
// points get similar angles → angular inheritance.

function makeVortices(
    dir: Direction, coverage: number, falloffWidth: number, rotStr: number
): Vortex[] {
    const covN = coverage / 100
    const fallEnd = covN + falloffWidth / 100
    const baseAngle = getDirAngle(dir)
    const vortices: Vortex[] = []
    const count = 5 + Math.round(covN * 6)

    for (let i = 0; i < count; i++) {
        const s1 = sr(i * 73 + 13)
        const s2 = sr(i * 137 + 29)
        const s3 = sr(i * 251 + 41)

        // Position within the distortion zone
        let cx: number, cy: number
        const reach = fallEnd * 0.85

        switch (dir) {
            case "left": cx = s1 * reach; cy = s2; break
            case "right": cx = 1 - s1 * reach; cy = s2; break
            case "top": cx = s2; cy = s1 * reach; break
            case "bottom": cx = s2; cy = 1 - s1 * reach; break
            case "top-left": cx = s1 * reach; cy = s2 * reach; break
            case "top-right": cx = 1 - s1 * reach; cy = s2 * reach; break
            case "bottom-left": cx = s1 * reach; cy = 1 - s2 * reach; break
            case "bottom-right": cx = 1 - s1 * reach; cy = 1 - s2 * reach; break
        }

        const dist = getDistance(cx, cy, dir)
        const depthStr = Math.max(0, 1 - dist / fallEnd)

        // Angle: sweeps along the field direction with per-vortex variation
        // Deeper vortices rotate more strongly
        const angle = baseAngle * depthStr * rotStr * (Math.PI / 180) * (0.5 + s3)
            + (s3 - 0.5) * 0.6 * rotStr * (Math.PI / 180)

        vortices.push({
            cx, cy,
            angle,
            radius: 0.08 + s2 * 0.14,
            strength: depthStr,
        })
    }
    return vortices
}

// Resolve the field angle at a point: smooth blend of all vortex influences
function getFieldAngle(nx: number, ny: number, vortices: Vortex[]): number {
    let angle = 0, tw = 0
    for (const v of vortices) {
        const dx = nx - v.cx, dy = ny - v.cy
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d > v.radius * 3) continue
        const w = smoothstep(v.radius * 3, 0, d) * v.strength
        if (w < 0.001) continue
        angle += v.angle * w
        tw += w
    }
    return tw > 0.001 ? angle / Math.min(tw, 1.2) : 0
}

// ─── Recursive Cell Generation ───────────────────────────────────────────────
// Quadtree subdivision: large cells at field edges, progressively
// smaller cells toward the core. Creates spatial hierarchy where
// parent regions visibly contain descendant cells.

function makeCells(
    contW: number, contH: number,
    vortices: Vortex[],
    dir: Direction,
    coverage: number, falloffWidth: number,
    edgeStepping: number, randomness: number,
    cellSize: number, density: number,
    islandDensity: number, islandScatter: number, islandFade: number,
    distStr: number, rotStr: number
): CellData[] {
    if (contW <= 0 || contH <= 0) return []

    const covN = coverage / 100
    const fallN = falloffWidth / 100
    const fallEnd = covN + fallN
    const steps = Math.max(1, edgeStepping)

    const startSize = cellSize * 4  // largest cell tier
    const minSize = cellSize * 0.5  // smallest subdivision
    const cells: CellData[] = []
    let cid = 0

    // Recursive subdivision
    function subdivide(
        x: number, y: number, w: number, h: number, depth: number
    ) {
        // Cell center in normalized space
        const nx = (x + w / 2) / contW
        const ny = (y + h / 2) / contH
        if (nx < -0.1 || nx > 1.1 || ny < -0.1 || ny > 1.1) return

        const dist = getDistance(nx, ny, dir)

        // Field depth: 0 at falloff edge, 1 at origin
        const fieldDepth = Math.max(0, 1 - dist / Math.max(0.01, fallEnd))

        // Should this cell subdivide further?
        // Deeper in the field → more subdivision → smaller cells
        const halfW = w / 2, halfH = h / 2
        const canSubdivide = halfW >= minSize && halfH >= minSize && depth < 4

        // Subdivision threshold: deeper field depth = easier to subdivide
        // This creates the gradient from large to small
        const subdivThreshold = depth === 0 ? 0.1
            : depth === 1 ? 0.3
            : depth === 2 ? 0.55
            : 0.75

        // Add some randomness to prevent uniform subdivision boundaries
        const subdivSeed = sr3(Math.floor(x), Math.floor(y), depth * 7)
        const subdivJitter = (subdivSeed - 0.5) * 0.15

        if (canSubdivide && fieldDepth > subdivThreshold + subdivJitter) {
            // Some cells skip subdivision for rhythm (fewer at deeper levels)
            const skipChance = depth === 0 ? 0.02 : depth === 1 ? 0.08 : 0.15
            if (subdivSeed < skipChance) {
                // Don't subdivide — emit as larger cell
                emitCell(x, y, w, h, depth, nx, ny, dist, fieldDepth)
                return
            }
            subdivide(x, y, halfW, halfH, depth + 1)
            subdivide(x + halfW, y, halfW, halfH, depth + 1)
            subdivide(x, y + halfH, halfW, halfH, depth + 1)
            subdivide(x + halfW, y + halfH, halfW, halfH, depth + 1)
            return
        }

        emitCell(x, y, w, h, depth, nx, ny, dist, fieldDepth)
    }

    function emitCell(
        x: number, y: number, w: number, h: number,
        depth: number, nx: number, ny: number,
        dist: number, fieldDepth: number
    ) {
        const seed = sr2(x * 0.1, y * 0.1)
        const jitter = (seed - 0.5) * randomness * 0.08

        // Zone determination
        let zone: CellData["zone"] | "clean" = "clean"
        let activity = 0

        if (dist < covN + jitter) {
            zone = "core"
            activity = 1
        } else if (dist < fallEnd + jitter) {
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

        // ── Rotational field angle at this cell ──
        const fieldAngle = getFieldAngle(nx, ny, vortices)

        // ── Sample displacement from field rotation ──
        // The pivot radius scales with cell size: smaller descendant
        // cells get proportionally smaller displacement, creating
        // the recursive cascade where children's rotation is
        // subordinate to their parent region's rotation.
        const pivotR = Math.sqrt(w * h) * 0.5 * distStr * activity
        const sampleX = Math.sin(fieldAngle) * pivotR
        const sampleY = (1 - Math.cos(fieldAngle)) * pivotR

        const phase = sr3(x * 0.1, y * 0.1, 17)

        cells.push({
            id: cid++,
            x, y, w, h, nx, ny,
            depth,
            fieldAngle,
            zone: zone as CellData["zone"],
            activity,
            sampleX, sampleY,
            phase,
        })
    }

    // Start recursion from a grid of large starting cells
    const startCols = Math.ceil(contW / startSize)
    const startRows = Math.ceil(contH / startSize)
    for (let r = 0; r < startRows; r++) {
        for (let c = 0; c < startCols; c++) {
            const x = c * startSize
            const y = r * startSize
            const w = Math.min(startSize, contW - x)
            const h = Math.min(startSize, contH - y)
            if (w > 4 && h > 4) {
                subdivide(x, y, w, h, 0)
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
    coverage: 40,
    falloffWidth: 24,
    edgeStepping: 5,
    randomness: 0.5,
    cellSize: 28,
    density: 0.92,
    distortionStrength: 1.4,
    cellOpacity: 1,
    islandDensity: 22,
    islandScatter: 14,
    islandFade: 0.4,
    ambientMotion: true,
    motionAmount: 0.3,
    drift: 0.15,
    flicker: 0.04,
    rotationEnabled: true,
    rotationStrength: 10,
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

    const vortices = useMemo(
        () => makeVortices(p.direction, p.coverage, p.falloffWidth, p.rotationStrength),
        [p.direction, p.coverage, p.falloffWidth, p.rotationStrength]
    )

    const cells = useMemo(
        () => makeCells(
            size.w, size.h, vortices, p.direction,
            p.coverage, p.falloffWidth, p.edgeStepping, p.randomness,
            p.cellSize, p.density,
            p.islandDensity, p.islandScatter, p.islandFade,
            p.distortionStrength, p.rotationStrength
        ),
        [size.w, size.h, vortices, p.direction, p.coverage, p.falloffWidth,
         p.edgeStepping, p.randomness, p.cellSize, p.density,
         p.islandDensity, p.islandScatter, p.islandFade,
         p.distortionStrength, p.rotationStrength]
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
                const inf = smoothstep(r, r * 0.2, d) * p.hoverIntensity
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

            let sx = c.sampleX * act
            let sy = c.sampleY * act

            // Ambient: rotational oscillation aligned with field angle
            if (p.ambientMotion && act > 0.05) {
                const a = p.motionAmount * act
                const s = p.drift
                // Oscillate along the cell's own field angle direction
                const osc = Math.sin(time * s * 0.35 + c.nx * Math.PI * 1.4 + c.ny * 0.8) * a
                sx += Math.sin(c.fieldAngle + Math.PI / 2) * osc * 2.5
                sy += Math.cos(c.fieldAngle + Math.PI / 2) * osc * 1.5
            }

            if (hInf > 0) {
                sx *= 1 + hInf * 0.5
                sy *= 1 + hInf * 0.5
            }

            const bgX = -(c.x + cropX) + sx
            const bgY = -(c.y + cropY) + sy

            let op = p.cellOpacity
            if (c.zone === "island") op *= 0.6 * act

            if (p.ambientMotion && p.flicker > 0) {
                op += Math.sin(time * 1.5 + c.phase * Math.PI * 6) * p.flicker * 0.04
                op = Math.max(0.1, Math.min(1, op))
            }

            let filter: string | undefined
            const fl: string[] = []
            if (p.contrast !== 0) fl.push(`contrast(${1 + p.contrast * act * 0.01})`)
            if (p.blur > 0) fl.push(`blur(${p.blur * act * 0.25}px)`)
            if (fl.length) filter = fl.join(" ")

            return { c, bgX, bgY, op, filter }
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

            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {renderData.map((d) => (
                    <div
                        key={d.c.id}
                        style={{
                            position: "absolute",
                            left: d.c.x,
                            top: d.c.y,
                            width: d.c.w,
                            height: d.c.h,
                            overflow: "hidden",
                            opacity: d.op,
                            backgroundImage: `url(${p.source})`,
                            backgroundSize: `${bgW}px ${bgH}px`,
                            backgroundPosition: `${d.bgX}px ${d.bgY}px`,
                            backgroundRepeat: "no-repeat",
                            filter: d.filter,
                        }}
                    />
                ))}
            </div>

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
        min: 5, max: 85, step: 1, unit: "%", defaultValue: 40,
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
        min: 0, max: 1, step: 0.05, defaultValue: 0.5,
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
        min: 0, max: 4, step: 0.1, defaultValue: 1.4,
    },
    cellOpacity: {
        type: ControlType.Number, title: "Opacity",
        min: 0.2, max: 1, step: 0.05, defaultValue: 1,
    },
    islandDensity: {
        type: ControlType.Number, title: "Island Density",
        min: 0, max: 80, step: 1, unit: "%", defaultValue: 22,
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
        min: 0, max: 2, step: 0.05, defaultValue: 0.3,
        hidden: (p) => !p.ambientMotion,
    },
    drift: {
        type: ControlType.Number, title: "Drift",
        min: 0, max: 2, step: 0.05, defaultValue: 0.15,
        hidden: (p) => !p.ambientMotion,
    },
    flicker: {
        type: ControlType.Number, title: "Flicker",
        min: 0, max: 1, step: 0.05, defaultValue: 0.04,
        hidden: (p) => !p.ambientMotion,
    },
    rotationEnabled: {
        type: ControlType.Boolean, title: "Rotation", defaultValue: true,
    },
    rotationStrength: {
        type: ControlType.Number, title: "Rotation Strength",
        min: 0, max: 30, step: 1, unit: "°", defaultValue: 10,
        hidden: (p) => !p.rotationEnabled,
    },
    hoverEnabled: {
        type: ControlType.Boolean, title: "Hover Reactive", defaultValue: true,
    },
    hoverRadius: {
        type: ControlType.Number, title: "Hover Radius",
        min: 30, max: 300, step: 5, unit: "px", defaultValue: 110,
        hidden: (p) => !p.hoverEnabled,
    },
    hoverIntensity: {
        type: ControlType.Number, title: "Hover Intensity",
        min: 0, max: 1, step: 0.05, defaultValue: 0.5,
        hidden: (p) => !p.hoverEnabled,
    },
    hoverRecovery: {
        type: ControlType.Number, title: "Hover Recovery",
        min: 0.01, max: 0.2, step: 0.01, defaultValue: 0.05,
        hidden: (p) => !p.hoverEnabled,
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
