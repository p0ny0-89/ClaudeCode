import { addPropertyControls, ControlType } from "framer"
import React, {
    useRef,
    useState,
    useEffect,
    useCallback,
    useMemo,
} from "react"

/*
 * FragmentField — Fractal cellular repetition
 *
 * The portrait dissolves into a dense recursive field of image-
 * derived cells. The fractal quality comes from the spatial
 * structure: seed clusters subdivide recursively, each parent
 * breaking into 3-5 children at ~55% scale, continuing for up
 * to 5 generations. Every cell shows the image at its own
 * position (cover-correct), so the portrait remains embedded
 * in the effect rather than looking like collage.
 *
 * Self-similarity emerges from the subdivision rule itself:
 * the same branching pattern repeats at every scale, creating
 * clusters of tiny cells nested inside medium clusters nested
 * inside larger structures. Dense pockets of cellular growth
 * contrast with quieter regions for compositional rhythm.
 *
 * Small sample offsets between generations create subtle
 * displacement echoes without the "pasted panel" look of
 * large-scale content duplication.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type Direction =
    | "left" | "right" | "top" | "bottom"
    | "top-left" | "top-right" | "bottom-left" | "bottom-right"

interface CellData {
    id: number
    x: number; y: number; w: number; h: number
    // Small sample offset: subtle displacement from true position
    offsetX: number; offsetY: number
    angle: number
    generation: number
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
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
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

function getFieldAngle(dir: Direction): number {
    switch (dir) {
        case "right": return 0
        case "bottom-right": return Math.PI * 0.25
        case "bottom": return Math.PI * 0.5
        case "bottom-left": return Math.PI * 0.75
        case "left": return Math.PI
        case "top-left": return Math.PI * 1.25
        case "top": return Math.PI * 1.5
        case "top-right": return Math.PI * 1.75
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

// ─── Fractal Cell Generation ────────────────────────────────────────────────
//
// 1. Place seed points within the active field zone
// 2. Each seed spawns a root cell, then recursively subdivides:
//    parent → 3-5 children at ~55% scale, offset in a fan pattern
// 3. Each generation adds a small cumulative sample offset
//    (so children show slightly shifted content, not identical)
// 4. Continue for up to 5 generations, creating dense micro-clusters
// 5. All cells show image content at their own position + offset
//    (no remote source duplication)

function makeCells(
    contW: number, contH: number,
    dir: Direction, fieldAngle: number,
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

    // Activity at a normalized point
    function getActivity(nx: number, ny: number): number {
        const dist = getDistance(nx, ny, dir)
        const seed = sr2(nx * 10.7, ny * 10.7)
        const jit = (seed - 0.5) * randomness * 0.06
        if (dist < covN + jit) return 1
        if (dist < fallEnd + jit) {
            const t = (dist - covN) / Math.max(0.001, fallN)
            const stepped = Math.floor(t * steps) / steps
            const act = Math.max(0, 1 - stepped)
            if (seed > density * act) return 0
            return act
        }
        if (dist < fallEnd + islandScatter / 100) {
            const thresh = 1 - (islandDensity / 100) * 0.18
            if (sr3(nx * 10.7, ny * 10.7, 17) > thresh) {
                const id2 = (dist - fallEnd) / (islandScatter / 100)
                return Math.max(0, 1 - id2) * (1 - islandFade) * 0.4
            }
        }
        return 0
    }

    const cells: CellData[] = []
    let cid = 0

    // ── Seed placement ──
    // Seeds are the starting points for recursive growth.
    // Denser near the core, sparser at edges.
    const seedSpacing = cellSize * 2.5 / Math.max(0.3, density)
    const seedCols = Math.ceil(contW / seedSpacing)
    const seedRows = Math.ceil(contH / seedSpacing)

    for (let sr_ = 0; sr_ < seedRows; sr_++) {
        for (let sc = 0; sc < seedCols; sc++) {
            const jx = (sr3(sc + 0.3, sr_ + 0.7, 11) - 0.5) * seedSpacing * 0.6 * randomness
            const jy = (sr3(sc + 0.7, sr_ + 0.3, 13) - 0.5) * seedSpacing * 0.6 * randomness
            const px = (sc + 0.5) * seedSpacing + jx
            const py = (sr_ + 0.5) * seedSpacing + jy
            const nx = px / contW, ny = py / contH
            if (nx < -0.01 || nx > 1.01 || ny < -0.01 || ny > 1.01) continue

            const activity = getActivity(nx, ny)
            if (activity < 0.05) continue

            // Seed placement probability
            const placeSeed = sr3(sc * 2.1 + 0.1, sr_ * 3.3 + 0.1, 77)
            if (placeSeed > 0.7 * density) continue

            const dist = getDistance(nx, ny, dir)
            const fieldDepth = Math.min(1, dist / Math.max(0.01, fallEnd))

            // Root size: smaller base, the fractal structure makes it feel large
            const rootSize = cellSize * lerp(1.8, 0.9, fieldDepth)

            // Max generations: more in core, fewer at edges
            const maxGen = fieldDepth < 0.25 ? 5
                : fieldDepth < 0.45 ? 4
                : fieldDepth < 0.65 ? 3
                : fieldDepth < 0.85 ? 2
                : 1

            // Growth direction: biased along field direction
            const angleJit = (sr3(sc + 0.1, sr_ + 0.1, 33) - 0.5) * Math.PI * 0.7
            const growAngle = fieldAngle + angleJit

            // ── Recursive subdivision ──
            subdivide(
                px, py, rootSize, 0, maxGen, growAngle,
                activity, 0, 0, // initial offset
                sc * 100 + sr_ // unique seed for this cluster
            )
        }
    }

    function subdivide(
        cx: number, cy: number,
        size: number, gen: number, maxGen: number,
        angle: number, parentActivity: number,
        cumOffsetX: number, cumOffsetY: number,
        clusterSeed: number
    ) {
        // Bounds and size check
        const nx = cx / contW, ny = cy / contH
        if (nx < -0.05 || nx > 1.05 || ny < -0.05 || ny > 1.05) return
        if (size < 4) return

        const activity = Math.min(parentActivity, getActivity(nx, ny))
        if (activity < 0.03) return

        // Aspect ratio variation
        const aSeed = sr3(cx * 0.13, cy * 0.17, gen * 7 + clusterSeed * 0.01)
        const aspect = 0.6 + aSeed * 0.8
        const w = size * Math.sqrt(aspect)
        const h = size / Math.sqrt(aspect)

        // Small cumulative sample offset per generation
        // This creates subtle displacement echoes without remote duplication
        const genOffsetX = (sr3(cx * 0.1, cy * 0.1, gen * 11 + 1) - 0.5) * size * 0.3 * distStr
        const genOffsetY = (sr3(cx * 0.1, cy * 0.1, gen * 11 + 2) - 0.5) * size * 0.3 * distStr
        const totalOffX = cumOffsetX + genOffsetX
        const totalOffY = cumOffsetY + genOffsetY

        // Subtle rotation: increases with generation, very small
        const rotSeed = sr3(cx * 0.2, cy * 0.2, gen * 13 + clusterSeed * 0.01)
        const cellAngle = (rotSeed - 0.5) * 0.04 * (gen + 1) * rotStr * (Math.PI / 180)

        cells.push({
            id: cid++,
            x: cx - w / 2, y: cy - h / 2, w, h,
            offsetX: totalOffX,
            offsetY: totalOffY,
            angle: cellAngle * activity,
            generation: gen,
            activity,
            phase: sr3(cx * 0.1, cy * 0.1, 17),
        })

        // ── Spawn children ──
        if (gen >= maxGen) return

        // Number of children: 3-5 at early generations, 2-3 at deeper ones
        const nBase = gen < 2 ? 4 : 3
        const nJit = sr3(cx * 0.1 + gen, cy * 0.1, clusterSeed + gen * 7)
        const nChildren = Math.max(2, nBase - Math.floor(nJit * 2))

        // Child scale: 45-60% of parent
        const baseScale = 0.48 + sr3(cx * 0.1, cy * 0.1, gen * 9 + 55) * 0.14

        // Fan spread
        const spreadTotal = Math.PI * (0.55 + gen * 0.15)
        const spreadStep = spreadTotal / Math.max(1, nChildren - 1)
        const spreadStart = angle - spreadTotal / 2

        for (let ci = 0; ci < nChildren; ci++) {
            // Skip for organic irregularity
            const skipS = sr3(cx * 0.1 + ci * 3.7, cy * 0.1, gen * 5 + clusterSeed)
            const skipThresh = gen < 2 ? 0.92 * density : 0.78 * density
            if (skipS > skipThresh) continue

            const childScale = baseScale + (sr3(ci + 0.1, gen + 0.1, clusterSeed + ci * 11) - 0.5) * 0.1
            const childSize = size * childScale
            if (childSize < 4) continue

            // Child direction
            const childAngle = nChildren === 1
                ? angle + (sr3(ci + 0.1, gen + 0.1, clusterSeed + 44) - 0.5) * 0.5
                : spreadStart + ci * spreadStep
                    + (sr3(ci * 3.1, gen + 0.1, clusterSeed + ci * 5) - 0.5) * spreadStep * 0.25

            // Distance from parent: tight, proportional to parent size
            const branchDist = size * (0.42 + sr3(ci + 0.1, gen + 0.1, clusterSeed + 88) * 0.2)

            const childX = cx + Math.cos(childAngle) * branchDist
            const childY = cy + Math.sin(childAngle) * branchDist

            // Continue recursion with slightly drifting angle
            const nextAngle = childAngle + (sr3(childX * 0.1, childY * 0.1, gen * 9 + ci) - 0.5) * 0.4

            subdivide(
                childX, childY, childSize,
                gen + 1, maxGen, nextAngle,
                activity, totalOffX, totalOffY,
                clusterSeed + ci * 100 + gen * 10
            )
        }
    }

    // Sort: parents first (gen 0 at bottom), deepest children on top
    cells.sort((a, b) => a.generation - b.generation)

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
    cellSize: 22,
    density: 0.8,
    distortionStrength: 1.0,
    cellOpacity: 1,
    islandDensity: 20,
    islandScatter: 14,
    islandFade: 0.4,
    ambientMotion: true,
    motionAmount: 0.25,
    drift: 0.12,
    flicker: 0.03,
    rotationEnabled: true,
    rotationStrength: 6,
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

    const fieldAngle = useMemo(() => getFieldAngle(p.direction), [p.direction])

    const cells = useMemo(
        () => makeCells(
            size.w, size.h, p.direction, fieldAngle,
            p.coverage, p.falloffWidth, p.edgeStepping, p.randomness,
            p.cellSize, p.density,
            p.islandDensity, p.islandScatter, p.islandFade,
            p.distortionStrength, p.rotationStrength
        ),
        [size.w, size.h, p.direction, fieldAngle, p.coverage, p.falloffWidth,
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

            // Background position: cell's own position + cumulative offset
            let bgX = -(c.x + cropX) + c.offsetX * act
            let bgY = -(c.y + cropY) + c.offsetY * act

            // Subtle rotation
            let angle = p.rotationEnabled ? c.angle : 0

            // Ambient motion
            if (p.ambientMotion && act > 0.05) {
                const a = p.motionAmount * act
                const s = p.drift
                const wave = Math.sin(time * s * 0.3 + c.phase * Math.PI * 4 + c.generation * 0.5)
                // Micro-drift on the sample offset
                bgX += wave * a * c.w * 0.04
                bgY += Math.cos(time * s * 0.2 + c.phase * 3) * a * c.h * 0.03
                angle += wave * a * 0.008 * p.distortionStrength
            }

            if (hInf > 0) {
                angle *= 1 + hInf * 0.3
            }

            const angleDeg = angle * (180 / Math.PI)

            // Expansion for rotation
            const absAngle = Math.abs(angle)
            const sinA = Math.sin(absAngle), cosA = Math.cos(absAngle)
            const expandX = (c.w * cosA + c.h * sinA - c.w) / 2 + 1
            const expandY = (c.w * sinA + c.h * cosA - c.h) / 2 + 1

            // Opacity: generation-based hierarchy
            // Root cells: base opacity; deeper cells: full, creating density
            let op = p.cellOpacity * act
            if (c.generation === 0) op *= 0.82
            else if (c.generation <= 2) op *= 0.92
            else op *= 0.85 + c.phase * 0.15

            if (p.ambientMotion && p.flicker > 0) {
                op += Math.sin(time * 1.5 + c.phase * Math.PI * 6) * p.flicker * 0.04
            }
            op = Math.max(0.06, Math.min(1, op))

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
                        }}
                    >
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
                            transform: d.angleDeg !== 0 ? `rotate(${d.angleDeg}deg)` : undefined,
                            transformOrigin: "center center",
                            filter: d.filter,
                        }} />
                    </div>
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
        min: 8, max: 60, step: 2, unit: "px", defaultValue: 22,
    },
    density: {
        type: ControlType.Number, title: "Density",
        min: 0.2, max: 1, step: 0.05, defaultValue: 0.8,
    },
    distortionStrength: {
        type: ControlType.Number, title: "Distortion",
        min: 0, max: 4, step: 0.1, defaultValue: 1.0,
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
        min: 0, max: 45, step: 1, unit: "°", defaultValue: 6,
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
