import { addPropertyControls, ControlType } from "framer"
import React, {
    useRef,
    useState,
    useEffect,
    useCallback,
    useMemo,
} from "react"

/*
 * FragmentField — Multi-sample cellular image field
 *
 * Each active cell contains 1–3 internal slices, each showing
 * image content sampled from a different position. The slices
 * are stacked vertically within the cell frame (no opacity
 * layering — each slice is a full-opacity crop from a different
 * image region). This creates genuine internal fragmentation:
 * the cell looks like it has been cut and reassembled from
 * multiple parts of the portrait.
 *
 * Cells are grouped into clusters (~4×4 grid of super-cells).
 * All cells in a cluster share the same set of displacement
 * sources, so neighboring cells echo each other's content.
 * Core cells get 3 slices (rich fragmentation), falloff cells
 * get 2 (moderate), islands get 1 (simple offset).
 *
 * The grid is a tightly packed column layout with no gaps.
 * Cells are larger, readable, architectural. The distortion
 * is in the sampling, not the structure.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type Direction =
    | "left" | "right" | "top" | "bottom"
    | "top-left" | "top-right" | "bottom-left" | "bottom-right"

interface SliceData {
    // Position within the cell (px, relative to cell top-left)
    localY: number
    localH: number
    // Displacement from the cell's true image position
    dispX: number
    dispY: number
}

interface CellData {
    id: number
    x: number; y: number; w: number; h: number
    slices: SliceData[]
    activity: number
    clusterId: number
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

function getFieldVector(dir: Direction): { dx: number; dy: number } {
    switch (dir) {
        case "left": return { dx: -1, dy: 0 }
        case "right": return { dx: 1, dy: 0 }
        case "top": return { dx: 0, dy: -1 }
        case "bottom": return { dx: 0, dy: 1 }
        case "top-left": return { dx: -0.707, dy: -0.707 }
        case "top-right": return { dx: 0.707, dy: -0.707 }
        case "bottom-left": return { dx: -0.707, dy: 0.707 }
        case "bottom-right": return { dx: 0.707, dy: 0.707 }
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

// ─── Cluster Source System ──────────────────────────────────────────────────
//
// The container is divided into a grid of "super-cells" (~4×4).
// Each super-cell defines 3 displacement vectors that all its
// child cells share. This creates local repetition: neighboring
// cells show the same set of image regions, creating echoing.

interface ClusterSources {
    disps: { dx: number; dy: number }[] // 3 displacement vectors
}

function makeClusterGrid(
    contW: number, contH: number,
    cellSize: number, dir: Direction, distStr: number
): { cols: number; rows: number; sources: ClusterSources[] } {
    const fv = getFieldVector(dir)
    const clusterSize = cellSize * 4
    const cols = Math.max(1, Math.ceil(contW / clusterSize))
    const rows = Math.max(1, Math.ceil(contH / clusterSize))
    const sources: ClusterSources[] = []

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c
            // 3 displacement vectors per cluster:
            // disp 0: small, mostly along field direction
            // disp 1: medium, with cross-axis component
            // disp 2: large, strong field-direction pull

            const s1 = sr3(c + 0.1, r + 0.1, 11)
            const s2 = sr3(c + 0.1, r + 0.1, 22)
            const s3 = sr3(c + 0.1, r + 0.1, 33)
            const s4 = sr3(c + 0.1, r + 0.1, 44)
            const s5 = sr3(c + 0.1, r + 0.1, 55)
            const s6 = sr3(c + 0.1, r + 0.1, 66)

            const baseStr = cellSize * distStr

            sources.push({
                disps: [
                    {
                        dx: fv.dx * baseStr * (0.8 + s1 * 1.0) + (s2 - 0.5) * baseStr * 0.4,
                        dy: fv.dy * baseStr * (0.8 + s1 * 1.0) + (s3 - 0.5) * baseStr * 0.4,
                    },
                    {
                        dx: fv.dx * baseStr * (1.5 + s3 * 1.5) + (s4 - 0.5) * baseStr * 0.8,
                        dy: fv.dy * baseStr * (1.5 + s3 * 1.5) + (s1 - 0.5) * baseStr * 0.8,
                    },
                    {
                        dx: fv.dx * baseStr * (2.5 + s5 * 2.0) + (s6 - 0.5) * baseStr * 1.0,
                        dy: fv.dy * baseStr * (2.5 + s5 * 2.0) + (s2 - 0.5) * baseStr * 1.0,
                    },
                ]
            })
        }
    }

    return { cols, rows, sources }
}

// ─── Grid + Slice Generation ────────────────────────────────────────────────

function makeCells(
    contW: number, contH: number,
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

    // Cluster grid
    const clusters = makeClusterGrid(contW, contH, cellSize, dir, distStr)
    const clusterW = contW / clusters.cols
    const clusterH = contH / clusters.rows

    function getCluster(px: number, py: number): { id: number; src: ClusterSources } {
        const cc = Math.min(clusters.cols - 1, Math.max(0, Math.floor(px / clusterW)))
        const cr = Math.min(clusters.rows - 1, Math.max(0, Math.floor(py / clusterH)))
        const id = cr * clusters.cols + cc
        return { id, src: clusters.sources[id] }
    }

    // Size family
    const unit = cellSize
    const sizes = [unit * 0.8, unit, unit * 1.4, unit * 1.8, unit * 2.4]

    // Build columns
    const columns: { x: number; w: number }[] = []
    let cx = 0, colIdx = 0
    while (cx < contW) {
        const si = Math.floor(sr2(colIdx * 7.3, 0.5) * sizes.length)
        let w = sizes[si]
        if (cx + w > contW) w = contW - cx
        if (w < unit * 0.3) break
        columns.push({ x: cx, w })
        cx += w
        colIdx++
    }

    const cells: CellData[] = []
    let cid = 0

    for (let ci = 0; ci < columns.length; ci++) {
        const col = columns[ci]
        let ry = 0, rowIdx = 0

        while (ry < contH) {
            const si = Math.floor(sr3(ci * 3.1, rowIdx * 5.7, 1) * sizes.length)
            let h = sizes[si]
            if (ry + h > contH) h = contH - ry
            if (h < unit * 0.3) break

            const cellX = col.x, cellY = ry
            const cellW = col.w, cellH = h
            const centerX = cellX + cellW / 2
            const centerY = cellY + cellH / 2
            const nx = centerX / contW, ny = centerY / contH

            ry += h
            rowIdx++

            // ── Zone / activity ──
            const dist = getDistance(nx, ny, dir)
            const seed = sr2(nx * 10.7, ny * 10.7)
            const jit = (seed - 0.5) * randomness * 0.06
            let activity = 0
            let zone: "core" | "falloff" | "island" | "clean" = "clean"

            if (dist < covN + jit) {
                activity = 1
                zone = "core"
            } else if (dist < fallEnd + jit) {
                const t = (dist - covN) / Math.max(0.001, fallN)
                const stepped = Math.floor(t * steps) / steps
                activity = Math.max(0, 1 - stepped)
                if (seed > density * activity) { activity = 0 }
                else { zone = "falloff" }
            } else if (dist < fallEnd + islandScatter / 100) {
                const thresh = 1 - (islandDensity / 100) * 0.18
                if (sr3(nx * 10.7, ny * 10.7, 17) > thresh) {
                    const id2 = (dist - fallEnd) / (islandScatter / 100)
                    activity = Math.max(0, 1 - id2) * (1 - islandFade) * 0.4
                    if (activity > 0.03) zone = "island"
                }
            }

            if (activity < 0.03) continue

            // ── Cluster & slices ──
            const cluster = getCluster(centerX, centerY)
            const clusterDisps = cluster.src.disps

            // Number of slices based on zone depth:
            // Core: 3 slices — rich internal fragmentation
            // Falloff: 2 slices — moderate
            // Island: 1 slice — simple offset
            const nSlices = zone === "core" ? 3
                : zone === "falloff" ? (activity > 0.5 ? 2 : 1)
                : 1

            // Build slices: divide cell height into segments
            const slices: SliceData[] = []

            if (nSlices === 1) {
                // Single slice uses first displacement
                slices.push({
                    localY: 0,
                    localH: cellH,
                    dispX: clusterDisps[0].dx * activity,
                    dispY: clusterDisps[0].dy * activity,
                })
            } else if (nSlices === 2) {
                // Two slices: split point varies per cell
                const splitFrac = 0.35 + sr3(centerX * 0.1, centerY * 0.1, 77) * 0.3
                const splitY = Math.round(cellH * splitFrac)

                slices.push({
                    localY: 0,
                    localH: splitY,
                    dispX: clusterDisps[0].dx * activity,
                    dispY: clusterDisps[0].dy * activity,
                })
                slices.push({
                    localY: splitY,
                    localH: cellH - splitY,
                    dispX: clusterDisps[1].dx * activity,
                    dispY: clusterDisps[1].dy * activity,
                })
            } else {
                // Three slices: two split points
                const s1 = 0.25 + sr3(centerX * 0.1, centerY * 0.1, 88) * 0.15
                const s2 = 0.55 + sr3(centerX * 0.1, centerY * 0.1, 99) * 0.2
                const y1 = Math.round(cellH * s1)
                const y2 = Math.round(cellH * s2)

                slices.push({
                    localY: 0,
                    localH: y1,
                    dispX: clusterDisps[0].dx * activity,
                    dispY: clusterDisps[0].dy * activity,
                })
                slices.push({
                    localY: y1,
                    localH: y2 - y1,
                    dispX: clusterDisps[1].dx * activity,
                    dispY: clusterDisps[1].dy * activity,
                })
                slices.push({
                    localY: y2,
                    localH: cellH - y2,
                    dispX: clusterDisps[2].dx * activity,
                    dispY: clusterDisps[2].dy * activity,
                })
            }

            cells.push({
                id: cid++,
                x: cellX, y: cellY,
                w: cellW, h: cellH,
                slices,
                activity,
                clusterId: cluster.id,
                phase: sr3(nx * 10, ny * 10, 17),
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
    direction: "top-right",
    coverage: 42,
    falloffWidth: 24,
    edgeStepping: 5,
    randomness: 0.4,
    cellSize: 42,
    density: 0.9,
    distortionStrength: 1.8,
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
            p.distortionStrength
        ),
        [size.w, size.h, p.direction, p.coverage, p.falloffWidth,
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

            // Compute rendered slices with final background positions
            const renderedSlices = c.slices.map((s, si) => {
                // Base bg position for this slice's region within the cell
                let bgX = -(c.x + cropX) + s.dispX * act
                let bgY = -(c.y + s.localY + cropY) + s.dispY * act

                // Ambient drift per slice (each slice drifts slightly differently)
                if (p.ambientMotion && act > 0.05) {
                    const a = p.motionAmount * act
                    const dr = p.drift
                    const phaseOff = si * 1.3
                    bgX += Math.sin(time * dr * 0.25 + c.phase * Math.PI * 4 + phaseOff) * a * c.w * 0.04
                    bgY += Math.cos(time * dr * 0.2 + c.phase * 3 + phaseOff) * a * s.localH * 0.03
                }

                // Hover: additional per-slice displacement
                if (hInf > 0) {
                    bgX += (sr3(c.x * 0.1, c.y * 0.1, si * 11 + 1) - 0.5) * hInf * c.w * 0.3
                    bgY += (sr3(c.x * 0.1, c.y * 0.1, si * 11 + 2) - 0.5) * hInf * s.localH * 0.3
                }

                return { ...s, bgX, bgY }
            })

            // Cell opacity
            let op = p.cellOpacity
            op *= lerp(0.75, 1, act)
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

            return { c, renderedSlices, op, filter }
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

            {/* Cell field */}
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
                        {/* Each slice is a full-opacity strip showing
                            image content from a different position */}
                        {d.renderedSlices.map((s, si) => (
                            <div
                                key={si}
                                style={{
                                    position: "absolute",
                                    left: 0,
                                    top: s.localY,
                                    width: d.c.w,
                                    height: s.localH,
                                    overflow: "hidden",
                                }}
                            >
                                <div style={{
                                    position: "absolute",
                                    left: 0,
                                    top: 0,
                                    width: d.c.w,
                                    height: s.localH,
                                    backgroundImage: `url(${p.source})`,
                                    backgroundSize: `${bgW}px ${bgH}px`,
                                    backgroundPosition: `${s.bgX}px ${s.bgY}px`,
                                    backgroundRepeat: "no-repeat",
                                    filter: d.filter,
                                }} />
                            </div>
                        ))}
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
        min: 0, max: 1, step: 0.05, defaultValue: 0.4,
    },
    cellSize: {
        type: ControlType.Number, title: "Cell Size",
        min: 20, max: 100, step: 2, unit: "px", defaultValue: 42,
    },
    density: {
        type: ControlType.Number, title: "Density",
        min: 0.2, max: 1, step: 0.05, defaultValue: 0.9,
    },
    distortionStrength: {
        type: ControlType.Number, title: "Distortion",
        min: 0, max: 4, step: 0.1, defaultValue: 1.8,
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
