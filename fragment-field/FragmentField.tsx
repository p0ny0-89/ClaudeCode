import { addPropertyControls, ControlType } from "framer"
import React, {
    useRef,
    useState,
    useEffect,
    useCallback,
    useMemo,
} from "react"

/*
 * FragmentField — Spherical 3D cell tilt field
 *
 * A uniform square grid overlays the image. Each active cell is
 * tilted in 3D space as if lying on the surface of an invisible
 * sphere pressed into the image from the origin corner.
 *
 * Each cell shows its CORRECT image region at native resolution
 * — no magnification, no displacement. The distortion comes from
 * the 3D perspective rotation: cells near the sphere pole face
 * the viewer; cells further out tilt increasingly toward the
 * sphere's horizon. This creates the faceted-glass-sphere look
 * where the image is recognizable but each tile refracts the
 * view slightly through its tilted angle.
 *
 * The stepped boundary interference comes from adjacent cells
 * having slightly different tilt angles — where they meet, the
 * perspective foreshortening differs, creating visible seams.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type Direction =
    | "left" | "right" | "top" | "bottom"
    | "top-left" | "top-right" | "bottom-left" | "bottom-right"

interface CellData {
    id: number
    col: number; row: number
    x: number; y: number; w: number; h: number
    tiltX: number       // 3D rotateX in degrees
    tiltY: number       // 3D rotateY in degrees
    activity: number
    phase: number
}

// ─── Utilities ───────────────────────────────────────────────────────────────

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

// ─── Spherical 3D Tilt Field ───────────────────────────────────────────────
// Models the image as being draped over a sphere centered at the origin
// corner. Each cell lies on that sphere surface, tilted in 3D space so
// its surface normal points outward from the sphere center.
//
// For a point at normalized offset (vx, vy) from the origin with sphere
// radius R, the height of the sphere surface above the image plane is
// h = sqrt(R² - r²) where r = sqrt(vx² + vy²). The surface normal is
// (vx, vy, h) / R. The tilt angles needed to orient a flat cell to
// this normal are:
//   tiltY (rotate around Y axis) = asin(vx / R) — tilt left/right
//   tiltX (rotate around X axis) = -asin(vy / R) — tilt up/down
// (negative on X because CSS Y axis is inverted)
//
// Near the origin: flat (facing viewer). Near the sphere edge: near-90°
// tilt (edge-on). Beyond the sphere: no tilt at all.

function getOrigin(dir: Direction): { ox: number; oy: number } {
    switch (dir) {
        case "left": return { ox: 0, oy: 0.5 }
        case "right": return { ox: 1, oy: 0.5 }
        case "top": return { ox: 0.5, oy: 0 }
        case "bottom": return { ox: 0.5, oy: 1 }
        case "top-left": return { ox: 0, oy: 0 }
        case "top-right": return { ox: 1, oy: 0 }
        case "bottom-left": return { ox: 0, oy: 1 }
        case "bottom-right": return { ox: 1, oy: 1 }
    }
}

function computeTilt(
    nx: number, ny: number,
    activity: number,
    col: number, row: number,
    ox: number, oy: number,
    strength: number,   // scales the tilt magnitude (0..1 typical)
    sphereRadius: number, // normalized radius of the sphere
    randomness: number
): { tiltX: number; tiltY: number } {
    if (activity < 0.01) return { tiltX: 0, tiltY: 0 }

    const R = Math.max(0.01, sphereRadius)

    // Vector from sphere origin to this cell (normalized coords)
    const vx = nx - ox
    const vy = ny - oy

    // Distance from origin (normalized)
    const r = Math.sqrt(vx * vx + vy * vy)

    // Outside the sphere: no tilt
    if (r >= R) return { tiltX: 0, tiltY: 0 }

    // Sphere surface orientation at this point
    // Clamp input to asin domain to avoid NaN
    const cx = Math.max(-1, Math.min(1, vx / R))
    const cy = Math.max(-1, Math.min(1, vy / R))

    // Tilt angles in radians, then convert to degrees
    // Scaled by strength so user can dial intensity
    let tiltY = Math.asin(cx) * strength * (180 / Math.PI)
    let tiltX = -Math.asin(cy) * strength * (180 / Math.PI)

    tiltY *= activity
    tiltX *= activity

    // Per-cell jitter for organic variation
    const jitX = (sr3(col * 0.7, row * 0.7, 33) - 0.5) * 2
    const jitY = (sr3(col * 0.7, row * 0.7, 77) - 0.5) * 2
    tiltX += jitX * 6 * randomness * activity
    tiltY += jitY * 6 * randomness * activity

    return { tiltX, tiltY }
}

// ─── Grid Cell Generation ───────────────────────────────────────────────────

function makeCells(
    contW: number, contH: number,
    dir: Direction,
    coverage: number, falloffWidth: number,
    edgeStepping: number, randomness: number,
    cellSize: number, density: number,
    islandDensity: number, islandScatter: number, islandFade: number,
    strength: number, sphereRadius: number
): CellData[] {
    if (contW <= 0 || contH <= 0 || cellSize < 4) return []

    const covN = coverage / 100
    const fallN = falloffWidth / 100
    const fallEnd = covN + fallN
    const steps = Math.max(1, edgeStepping)

    const gridCols = Math.ceil(contW / cellSize)
    const gridRows = Math.ceil(contH / cellSize)
    const { ox, oy } = getOrigin(dir)
    const cells: CellData[] = []
    let cid = 0

    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const x = col * cellSize
            const y = row * cellSize
            const w = Math.min(cellSize, contW - x)
            const h = Math.min(cellSize, contH - y)
            if (w < 2 || h < 2) continue

            const nx = (x + w / 2) / contW
            const ny = (y + h / 2) / contH

            // Zone / activity
            const dist = getDistance(nx, ny, dir)
            const seed = sr2(nx * 10.7, ny * 10.7)
            const jit = (seed - 0.5) * randomness * 0.06
            let activity = 0

            if (dist < covN + jit) {
                activity = 1
            } else if (dist < fallEnd + jit) {
                const t = (dist - covN) / Math.max(0.001, fallN)
                const stepped = Math.floor(t * steps) / steps
                activity = Math.max(0, 1 - stepped)
                if (seed > density * activity) activity = 0
            } else if (dist < fallEnd + islandScatter / 100) {
                const thresh = 1 - (islandDensity / 100) * 0.18
                if (sr3(nx * 10.7, ny * 10.7, 17) > thresh) {
                    const id2 = (dist - fallEnd) / (islandScatter / 100)
                    activity = Math.max(0, 1 - id2) * (1 - islandFade) * 0.4
                }
            }

            if (activity < 0.03) continue

            const { tiltX, tiltY } = computeTilt(
                nx, ny, activity, col, row,
                ox, oy, strength, sphereRadius, randomness
            )

            cells.push({
                id: cid++,
                col, row, x, y, w, h,
                tiltX, tiltY,
                activity,
                phase: sr3(col * 0.7, row * 0.7, 17),
            })
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
    sphereRadius: number
    cellOpacity: number
    islandDensity: number
    islandScatter: number
    islandFade: number
    ambientMotion: boolean
    motionAmount: number
    drift: number
    flicker: number
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
    direction: "bottom-right",
    coverage: 78,
    falloffWidth: 16,
    edgeStepping: 8,
    randomness: 0.3,
    cellSize: 30,
    density: 1.0,
    distortionStrength: 0.7,
    sphereRadius: 1.4,
    cellOpacity: 1,
    islandDensity: 20,
    islandScatter: 14,
    islandFade: 0.4,
    ambientMotion: true,
    motionAmount: 0.2,
    drift: 0.1,
    flicker: 0.02,
    hoverEnabled: true,
    hoverRadius: 120,
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

    const cells = useMemo(
        () => makeCells(
            size.w, size.h, p.direction,
            p.coverage, p.falloffWidth, p.edgeStepping, p.randomness,
            p.cellSize, p.density,
            p.islandDensity, p.islandScatter, p.islandFade,
            p.distortionStrength, p.sphereRadius
        ),
        [size.w, size.h, p.direction, p.coverage, p.falloffWidth,
         p.edgeStepping, p.randomness, p.cellSize, p.density,
         p.islandDensity, p.islandScatter, p.islandFade,
         p.distortionStrength, p.sphereRadius]
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
            const ccx = c.x + c.w / 2, ccy = c.y + c.h / 2
            const d = Math.sqrt((mx - ccx) ** 2 + (my - ccy) ** 2)
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
            const act = Math.min(1, c.activity + hInf * 0.4)

            let tiltX = c.tiltX
            let tiltY = c.tiltY

            // Ambient: gentle tilt oscillation
            if (p.ambientMotion && act > 0.05) {
                const a = p.motionAmount * act
                const s = p.drift
                const osc = Math.sin(time * s * 0.3 + c.phase * Math.PI * 4) * a
                tiltX += osc * 3
                tiltY += osc * 3
            }

            // Hover: boost tilt
            if (hInf > 0) {
                tiltX *= 1 + hInf * 0.5
                tiltY *= 1 + hInf * 0.5
            }

            // Background position: cover-correct, cell shows its own region
            const bgX = -(c.x + cropX)
            const bgY = -(c.y + cropY)

            // Opacity
            let op = p.cellOpacity
            if (p.ambientMotion && p.flicker > 0) {
                op += Math.sin(time * 1.5 + c.phase * Math.PI * 6) * p.flicker * 0.04
            }
            op = Math.max(0.15, Math.min(1, op))

            // Filters
            let filter: string | undefined
            const fl: string[] = []
            if (p.contrast !== 0) fl.push(`contrast(${1 + p.contrast * act * 0.01})`)
            if (p.blur > 0) fl.push(`blur(${p.blur * act * 0.25}px)`)
            if (fl.length) filter = fl.join(" ")

            return { c, bgX, bgY, tiltX, tiltY, op, filter }
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

            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                perspective: "800px",
                transformStyle: "preserve-3d",
            }}>
                {renderData.map((d) => (
                    <div
                        key={d.c.id}
                        style={{
                            position: "absolute",
                            left: d.c.x,
                            top: d.c.y,
                            width: d.c.w,
                            height: d.c.h,
                            opacity: d.op,
                            transform: `rotateX(${d.tiltX}deg) rotateY(${d.tiltY}deg)`,
                            transformStyle: "preserve-3d",
                            backfaceVisibility: "hidden",
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
        defaultValue: "bottom-right",
    },
    coverage: {
        type: ControlType.Number, title: "Coverage",
        min: 5, max: 85, step: 1, unit: "%", defaultValue: 78,
    },
    falloffWidth: {
        type: ControlType.Number, title: "Falloff Width",
        min: 0, max: 50, step: 1, unit: "%", defaultValue: 16,
    },
    edgeStepping: {
        type: ControlType.Number, title: "Edge Stepping",
        min: 2, max: 12, step: 1, defaultValue: 8,
    },
    randomness: {
        type: ControlType.Number, title: "Randomness",
        min: 0, max: 1, step: 0.05, defaultValue: 0.3,
    },
    cellSize: {
        type: ControlType.Number, title: "Cell Size",
        min: 12, max: 80, step: 2, unit: "px", defaultValue: 30,
    },
    density: {
        type: ControlType.Number, title: "Density",
        min: 0.2, max: 1, step: 0.05, defaultValue: 1.0,
    },
    distortionStrength: {
        type: ControlType.Number, title: "Tilt Strength",
        min: 0.1, max: 1.5, step: 0.05, defaultValue: 0.7,
    },
    sphereRadius: {
        type: ControlType.Number, title: "Sphere Radius",
        min: 0.3, max: 2.5, step: 0.05, defaultValue: 1.4,
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
        min: 0, max: 2, step: 0.05, defaultValue: 0.2,
        hidden: (pp) => !pp.ambientMotion,
    },
    drift: {
        type: ControlType.Number, title: "Drift",
        min: 0, max: 2, step: 0.05, defaultValue: 0.1,
        hidden: (pp) => !pp.ambientMotion,
    },
    flicker: {
        type: ControlType.Number, title: "Flicker",
        min: 0, max: 1, step: 0.05, defaultValue: 0.02,
        hidden: (pp) => !pp.ambientMotion,
    },
    hoverEnabled: {
        type: ControlType.Boolean, title: "Hover Reactive", defaultValue: true,
    },
    hoverRadius: {
        type: ControlType.Number, title: "Hover Radius",
        min: 30, max: 300, step: 5, unit: "px", defaultValue: 120,
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
