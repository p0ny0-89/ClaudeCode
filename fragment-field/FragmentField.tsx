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
 * The portrait dissolves into recursive clusters of repeated image
 * cells. Each cluster originates from a "seed" — a source sample
 * point in the image. From that seed, cells branch outward across
 * multiple generations: each parent spawns smaller children that
 * echo the same image content. The result is a field of self-similar
 * cellular repetition where small units feel derived from a common
 * structural rule.
 *
 * Key visual language:
 *   - Duplication, not displacement
 *   - Branching, not scattering
 *   - Self-similar nesting, not uniform tiling
 *   - Clustered density, not even distribution
 *
 * Each cell's background-position references its cluster's source
 * point, so all cells in a cluster show the same (or closely related)
 * image content at different scales.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type Direction =
    | "left" | "right" | "top" | "bottom"
    | "top-left" | "top-right" | "bottom-left" | "bottom-right"

interface CellData {
    id: number
    x: number; y: number; w: number; h: number
    // Source sample: where this cell's image content comes from
    srcX: number; srcY: number
    angle: number
    generation: number    // 0=root, 1,2,3... = descendants
    clusterId: number
    activity: number
    phase: number
}

interface SeedPoint {
    // Where the cluster grows from (in container px)
    cx: number; cy: number
    // Where in the image to sample (in container px)
    srcX: number; srcY: number
    // Growth direction (radians)
    growAngle: number
    // Scale
    rootSize: number
    // Max branching depth
    maxGen: number
    // Strength / intensity
    strength: number
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

// ─── Directional field ──────────────────────────────────────────────────────

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

// ─── Seed Generation ────────────────────────────────────────────────────────
// Seeds are source points from which clusters branch.
// Placed within the active field zone with intentional spacing.
// Each seed references a nearby image region as its source content.

function makeSeeds(
    contW: number, contH: number,
    dir: Direction, fieldAngle: number,
    coverage: number, falloffWidth: number,
    cellSize: number, density: number,
    distStr: number, randomness: number
): SeedPoint[] {
    const covN = coverage / 100
    const fallN = falloffWidth / 100
    const fallEnd = covN + fallN
    const seeds: SeedPoint[] = []

    // Place seeds in a Poisson-like distribution within the active zone.
    // Use the field direction to bias growth angles.
    // Seeds closer to the origin grow larger/deeper; outer seeds are smaller.

    // Candidate grid: test positions and keep those in the active zone
    const spacing = cellSize * 3.5 / Math.max(0.3, density)
    const cols = Math.ceil(contW / spacing)
    const rows = Math.ceil(contH / spacing)

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // Jittered position
            const jx = (sr3(c + 0.3, r + 0.7, 11) - 0.5) * spacing * 0.7 * randomness
            const jy = (sr3(c + 0.7, r + 0.3, 13) - 0.5) * spacing * 0.7 * randomness
            const px = (c + 0.5) * spacing + jx
            const py = (r + 0.5) * spacing + jy
            const nx = px / contW, ny = py / contH
            if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue

            const dist = getDistance(nx, ny, dir)
            if (dist > fallEnd * 1.1) continue

            // Field depth: 0 = deep in core, 1 = at falloff edge
            const fieldDepth = Math.min(1, dist / Math.max(0.01, fallEnd))

            // Probability of placing a seed: denser near core
            const placePr = (1 - fieldDepth * 0.6) * density
            const placeSeed = sr3(c * 2.1 + 0.1, r * 3.3 + 0.1, 77)
            if (placeSeed > placePr) continue

            // Root size: larger in core, smaller at edges
            const rootSize = cellSize * lerp(2.8, 1.2, fieldDepth)

            // Max generations: deeper in field = more recursion
            const maxGen = fieldDepth < 0.3 ? 4
                : fieldDepth < 0.55 ? 3
                : fieldDepth < 0.8 ? 2
                : 1

            // Growth direction: follows field direction with variation
            const angleJitter = (sr3(c + 0.1, r + 0.1, 33) - 0.5) * Math.PI * 0.6
            const growAngle = fieldAngle + angleJitter

            // Source point: sample from nearby image content
            // Offset slightly along the field direction so cells show
            // content from "behind" their position (dragged repetition)
            const srcOffset = rootSize * distStr * 0.5
            const srcX = px - Math.cos(fieldAngle) * srcOffset
            const srcY = py - Math.sin(fieldAngle) * srcOffset

            // Strength: how much activity/opacity this cluster has
            const strength = fieldDepth < 0.3 ? 1
                : fieldDepth < 0.6 ? 0.85
                : lerp(0.65, 0.3, (fieldDepth - 0.6) / 0.4)

            seeds.push({
                cx: px, cy: py,
                srcX, srcY,
                growAngle,
                rootSize,
                maxGen,
                strength,
            })
        }
    }

    return seeds
}

// ─── Cluster Growth ─────────────────────────────────────────────────────────
// From each seed, grow a branching cluster of cells.
// Each parent spawns 2-3 children in a spreading fan pattern.
// All cells in a cluster reference the same source sample.

function growClusters(
    seeds: SeedPoint[],
    contW: number, contH: number,
    dir: Direction,
    cellSize: number, density: number,
    randomness: number, distStr: number,
    coverage: number, falloffWidth: number,
    islandDensity: number, islandScatter: number, islandFade: number,
    edgeStepping: number
): CellData[] {
    const covN = coverage / 100
    const fallN = falloffWidth / 100
    const fallEnd = covN + fallN
    const steps = Math.max(1, edgeStepping)
    const minDim = Math.max(6, cellSize * 0.22)
    const cells: CellData[] = []
    let cid = 0

    // Occupancy grid to prevent over-stacking
    const occStep = cellSize * 0.4
    const occupied = new Set<string>()
    function gk(x: number, y: number): string {
        return `${Math.floor(x / occStep)},${Math.floor(y / occStep)}`
    }
    function tryOccupy(x: number, y: number, w: number, h: number): boolean {
        const key = gk(x + w / 2, y + h / 2)
        if (occupied.has(key)) return false
        occupied.add(key)
        return true
    }

    // Activity at a point (zone-aware)
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

    for (let si = 0; si < seeds.length; si++) {
        const seed = seeds[si]

        // Queue: each entry is a cell to place + branch from
        interface BranchNode {
            x: number; y: number
            size: number
            gen: number
            angle: number // growth direction for this branch
        }

        const queue: BranchNode[] = [{
            x: seed.cx,
            y: seed.cy,
            size: seed.rootSize,
            gen: 0,
            angle: seed.growAngle,
        }]

        let placed = 0
        const maxCellsPerCluster = 35

        while (queue.length > 0 && placed < maxCellsPerCluster) {
            const node = queue.shift()!
            const { x, y, size, gen, angle } = node

            // Aspect variation per cell
            const aSeed = sr3(x * 0.1, y * 0.1, gen * 7 + si * 31)
            const aspect = 0.65 + aSeed * 0.7
            const w = size * Math.sqrt(aspect)
            const h = size / Math.sqrt(aspect)

            const cellX = x - w / 2
            const cellY = y - h / 2
            const nx = x / contW, ny = y / contH

            // Bounds check
            if (nx < -0.03 || nx > 1.03 || ny < -0.03 || ny > 1.03) continue

            // Activity check
            const activity = getActivity(nx, ny)
            if (activity < 0.03) continue

            // Occupancy check
            if (!tryOccupy(cellX, cellY, w, h)) continue

            // Source sample: same as cluster seed, with tiny per-cell jitter
            // so cells aren't pixel-identical (feels sampled, not cloned)
            const srcJitX = (sr3(x * 0.3, y * 0.3, gen * 5 + 1) - 0.5) * size * 0.15
            const srcJitY = (sr3(x * 0.3, y * 0.3, gen * 5 + 2) - 0.5) * size * 0.15
            const srcX = seed.srcX + srcJitX
            const srcY = seed.srcY + srcJitY

            // Subtle rotation: increases slightly with generation
            const rotSeed = sr3(x * 0.2, y * 0.2, gen * 11 + si * 7)
            const cellAngle = (rotSeed - 0.5) * 0.06 * (gen + 1) * distStr

            cells.push({
                id: cid++,
                x: cellX, y: cellY, w, h,
                srcX, srcY,
                angle: cellAngle,
                generation: gen,
                clusterId: si,
                activity: activity * seed.strength,
                phase: sr3(x * 0.1, y * 0.1, 17),
            })
            placed++

            // ── Branch: spawn children ──
            if (gen >= seed.maxGen) continue

            // Number of children: 2-4, fewer at deeper generations
            const nChildren = gen === 0 ? 3 + Math.floor(sr3(si + 0.1, gen + 0.1, 55) * 2)
                : gen === 1 ? 2 + Math.floor(sr3(x * 0.1, y * 0.1, 66) * 2)
                : 2

            // Spread angle: children fan out from parent
            const spreadTotal = Math.PI * (0.5 + gen * 0.2)
            const spreadStep = spreadTotal / Math.max(1, nChildren - 1)
            const spreadStart = angle - spreadTotal / 2

            for (let ci = 0; ci < nChildren; ci++) {
                // Skip some children for organic irregularity
                const skipSeed = sr3(x * 0.1 + ci, y * 0.1, gen * 3 + si * 13)
                if (skipSeed > density * 0.9) continue

                // Child size: 50-70% of parent
                const childScale = 0.5 + sr3(ci + 0.1, gen + 0.1, si * 7 + 22) * 0.2
                const childSize = size * childScale
                if (childSize < minDim) continue

                // Child direction: within the fan spread
                const childAngle = nChildren === 1
                    ? angle + (sr3(ci + 0.1, gen + 0.1, si + 44) - 0.5) * 0.4
                    : spreadStart + ci * spreadStep
                        + (sr3(ci * 3.1, gen + 0.1, si * 5 + 33) - 0.5) * spreadStep * 0.3

                // Distance from parent: proportional to parent size
                const branchDist = size * (0.55 + sr3(ci + 0.1, gen + 0.1, si + 88) * 0.35)

                const childX = x + Math.cos(childAngle) * branchDist
                const childY = y + Math.sin(childAngle) * branchDist

                queue.push({
                    x: childX, y: childY,
                    size: childSize,
                    gen: gen + 1,
                    angle: childAngle + (sr3(childX * 0.1, childY * 0.1, gen * 9) - 0.5) * 0.3,
                })
            }
        }
    }

    // Sort: root cells first (background), deepest generation on top
    // This creates the visual nesting: small descendants overlay parents
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
    cellSize: 30,
    density: 0.75,
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
    rotationStrength: 8,
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

    const seeds = useMemo(
        () => makeSeeds(
            size.w, size.h, p.direction, fieldAngle,
            p.coverage, p.falloffWidth, p.cellSize, p.density,
            p.distortionStrength, p.randomness
        ),
        [size.w, size.h, p.direction, fieldAngle, p.coverage, p.falloffWidth,
         p.cellSize, p.density, p.distortionStrength, p.randomness]
    )

    const cells = useMemo(
        () => growClusters(
            seeds, size.w, size.h, p.direction,
            p.cellSize, p.density, p.randomness, p.distortionStrength,
            p.coverage, p.falloffWidth,
            p.islandDensity, p.islandScatter, p.islandFade,
            p.edgeStepping
        ),
        [seeds, size.w, size.h, p.direction, p.cellSize, p.density,
         p.randomness, p.distortionStrength, p.coverage, p.falloffWidth,
         p.islandDensity, p.islandScatter, p.islandFade, p.edgeStepping]
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

            // ── Background position: uses SOURCE coordinates, not cell position ──
            // This is the key: all cells in a cluster show the SAME image region
            let bgX = -(c.srcX + cropX) + (c.w - cW) * 0 // source-based
            let bgY = -(c.srcY + cropY)

            // Clamp source to reasonable range to avoid showing blank
            // Offset so the cell window shows the source region
            bgX = -(c.srcX + cropX)
            bgY = -(c.srcY + cropY)

            // ── Subtle rotation ──
            let angle = p.rotationEnabled ? c.angle * p.rotationStrength / 8 : 0

            // Ambient
            if (p.ambientMotion && act > 0.05) {
                const a = p.motionAmount * act
                const s = p.drift
                const wave = Math.sin(
                    time * s * 0.3 + c.phase * Math.PI * 4 + c.generation * 0.7
                )
                angle += wave * a * 0.012 * p.distortionStrength
                // Subtle source drift: the repeated content shifts slightly
                bgX += Math.sin(time * s * 0.15 + c.phase * 3) * a * c.w * 0.03
                bgY += Math.cos(time * s * 0.12 + c.phase * 5) * a * c.h * 0.02
            }

            // Hover
            if (hInf > 0) {
                angle *= 1 + hInf * 0.3
            }

            const angleDeg = angle * (180 / Math.PI)

            // ── Expansion for rotation ──
            const absAngle = Math.abs(angle)
            const sinA = Math.sin(absAngle), cosA = Math.cos(absAngle)
            const expandX = (c.w * cosA + c.h * sinA - c.w) / 2 + 1
            const expandY = (c.w * sinA + c.h * cosA - c.h) / 2 + 1

            // ── Opacity: generation-based hierarchy ──
            let op = p.cellOpacity * act
            // Root cells: slightly transparent so the portrait reads through
            if (c.generation === 0) op *= 0.88
            // Mid-generation: full
            if (c.generation >= 1 && c.generation <= 2) op *= 0.95
            // Deep descendants: varied for tonal richness
            if (c.generation >= 3) op *= 0.75 + c.phase * 0.25

            if (p.ambientMotion && p.flicker > 0) {
                op += Math.sin(time * 1.5 + c.phase * Math.PI * 6) * p.flicker * 0.04
            }
            op = Math.max(0.08, Math.min(1, op))

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

            {/* Fractal cell field */}
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
        min: 12, max: 80, step: 2, unit: "px", defaultValue: 30,
    },
    density: {
        type: ControlType.Number, title: "Density",
        min: 0.2, max: 1, step: 0.05, defaultValue: 0.75,
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
        min: 0, max: 45, step: 1, unit: "°", defaultValue: 8,
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
