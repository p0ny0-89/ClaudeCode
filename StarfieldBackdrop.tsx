import { addPropertyControls, ControlType } from "framer"
import React, { useRef, useEffect, useCallback } from "react"

// ─── Types ────────────────────────────────────────────────

interface Star {
    x: number
    y: number
    radius: number
    baseAlpha: number
    alpha: number
    twinkleSpeed: number
    twinklePhase: number
}

interface ShootingStar {
    x: number
    y: number
    length: number
    speed: number
    angle: number
    alpha: number
    life: number
    maxLife: number
    width: number
}

interface Props {
    starCount: number
    starColor: string
    starMinSize: number
    starMaxSize: number
    twinkleSpeed: number
    shootingStarFrequency: number
    shootingStarColor: string
    shootingStarLength: number
    shootingStarSpeed: number
    bgColor: string
    bgGradient: boolean
    bgGradientCenter: string
    bgGradientEdge: string
    depth: boolean
    glowIntensity: number
    style?: React.CSSProperties
}

// ─── Helpers ──────────────────────────────────────────────

function parseColor(hex: string): [number, number, number] {
    const h = hex.replace("#", "")
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ]
}

function createStar(w: number, h: number, props: Props): Star {
    const depth = props.depth ? Math.random() : 1
    const minR = props.starMinSize
    const maxR = props.starMaxSize
    return {
        x: Math.random() * w,
        y: Math.random() * h,
        radius: minR + Math.random() * (maxR - minR) * depth,
        baseAlpha: 0.3 + Math.random() * 0.7 * depth,
        alpha: 0,
        twinkleSpeed:
            (0.3 + Math.random() * 1.7) * props.twinkleSpeed * 0.01,
        twinklePhase: Math.random() * Math.PI * 2,
    }
}

function createShootingStar(w: number, h: number, props: Props): ShootingStar {
    const angle = (Math.PI / 6) + Math.random() * (Math.PI / 3) // 30°–90° downward
    const edge = Math.random()
    let x: number, y: number
    if (edge < 0.7) {
        // start from top
        x = Math.random() * w
        y = -10
    } else {
        // start from right side
        x = w + 10
        y = Math.random() * h * 0.4
    }
    return {
        x,
        y,
        length: props.shootingStarLength * (0.7 + Math.random() * 0.6),
        speed: props.shootingStarSpeed * (0.8 + Math.random() * 0.4),
        angle,
        alpha: 1,
        life: 0,
        maxLife: 1.5 + Math.random() * 1,
        width: 1 + Math.random() * 1.5,
    }
}

// ─── Component ────────────────────────────────────────────

function StarfieldBackdrop(props: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const starsRef = useRef<Star[]>([])
    const shootingStarsRef = useRef<ShootingStar[]>([])
    const frameRef = useRef<number>(0)
    const lastTimeRef = useRef<number>(0)
    const shootingTimerRef = useRef<number>(0)
    const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })

    const propsRef = useRef(props)
    propsRef.current = props

    const initStars = useCallback((w: number, h: number) => {
        const p = propsRef.current
        starsRef.current = Array.from({ length: p.starCount }, () =>
            createStar(w, h, p)
        )
        sizeRef.current = { w, h }
    }, [])

    useEffect(() => {
        const container = containerRef.current
        const canvas = canvasRef.current
        if (!container || !canvas) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const resize = () => {
            const w = container.offsetWidth
            const h = container.offsetHeight
            if (w === 0 || h === 0) return
            const dpr = window.devicePixelRatio || 1
            canvas.width = w * dpr
            canvas.height = h * dpr
            canvas.style.width = `${w}px`
            canvas.style.height = `${h}px`
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            initStars(w, h)
        }

        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(container)

        lastTimeRef.current = performance.now()
        shootingTimerRef.current = 0

        const animate = (now: number) => {
            const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1)
            lastTimeRef.current = now
            const p = propsRef.current
            const { w, h } = sizeRef.current

            // Clear
            ctx.clearRect(0, 0, w, h)

            // Background
            if (p.bgGradient) {
                const grd = ctx.createRadialGradient(
                    w / 2, h / 2, 0,
                    w / 2, h / 2, Math.max(w, h) * 0.7
                )
                grd.addColorStop(0, p.bgGradientCenter)
                grd.addColorStop(1, p.bgGradientEdge)
                ctx.fillStyle = grd
            } else {
                ctx.fillStyle = p.bgColor
            }
            ctx.fillRect(0, 0, w, h)

            // Stars
            const [sr, sg, sb] = parseColor(p.starColor)
            const glowI = p.glowIntensity

            for (const star of starsRef.current) {
                star.twinklePhase += star.twinkleSpeed * dt * 60
                const twinkle =
                    0.5 + 0.5 * Math.sin(star.twinklePhase)
                star.alpha = star.baseAlpha * (0.4 + 0.6 * twinkle)

                // Glow
                if (glowI > 0 && star.radius > 0.8) {
                    const glowRadius = star.radius * (3 + glowI * 4)
                    const glow = ctx.createRadialGradient(
                        star.x, star.y, 0,
                        star.x, star.y, glowRadius
                    )
                    glow.addColorStop(
                        0,
                        `rgba(${sr},${sg},${sb},${star.alpha * glowI * 0.3})`
                    )
                    glow.addColorStop(1, `rgba(${sr},${sg},${sb},0)`)
                    ctx.fillStyle = glow
                    ctx.fillRect(
                        star.x - glowRadius,
                        star.y - glowRadius,
                        glowRadius * 2,
                        glowRadius * 2
                    )
                }

                // Star dot
                ctx.beginPath()
                ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(${sr},${sg},${sb},${star.alpha})`
                ctx.fill()
            }

            // Shooting stars
            shootingTimerRef.current += dt
            const interval =
                p.shootingStarFrequency > 0
                    ? 1 / (p.shootingStarFrequency * 0.1)
                    : Infinity
            if (shootingTimerRef.current >= interval) {
                shootingTimerRef.current = 0
                shootingStarsRef.current.push(createShootingStar(w, h, p))
            }

            const [mr, mg, mb] = parseColor(p.shootingStarColor)
            shootingStarsRef.current = shootingStarsRef.current.filter((s) => {
                s.life += dt
                const progress = s.life / s.maxLife

                // Fade in fast, fade out slow
                if (progress < 0.1) {
                    s.alpha = progress / 0.1
                } else if (progress > 0.6) {
                    s.alpha = 1 - (progress - 0.6) / 0.4
                } else {
                    s.alpha = 1
                }

                // Move
                s.x += Math.cos(s.angle) * s.speed * dt * 60
                s.y += Math.sin(s.angle) * s.speed * dt * 60

                // Draw trail
                const tailX = s.x - Math.cos(s.angle) * s.length
                const tailY = s.y - Math.sin(s.angle) * s.length

                const gradient = ctx.createLinearGradient(
                    tailX, tailY, s.x, s.y
                )
                gradient.addColorStop(0, `rgba(${mr},${mg},${mb},0)`)
                gradient.addColorStop(
                    1,
                    `rgba(${mr},${mg},${mb},${s.alpha})`
                )

                ctx.beginPath()
                ctx.moveTo(tailX, tailY)
                ctx.lineTo(s.x, s.y)
                ctx.strokeStyle = gradient
                ctx.lineWidth = s.width
                ctx.lineCap = "round"
                ctx.stroke()

                // Head glow
                const headGlow = ctx.createRadialGradient(
                    s.x, s.y, 0,
                    s.x, s.y, s.width * 4
                )
                headGlow.addColorStop(
                    0,
                    `rgba(255,255,255,${s.alpha * 0.8})`
                )
                headGlow.addColorStop(
                    1,
                    `rgba(${mr},${mg},${mb},0)`
                )
                ctx.fillStyle = headGlow
                ctx.fillRect(
                    s.x - s.width * 4,
                    s.y - s.width * 4,
                    s.width * 8,
                    s.width * 8
                )

                return s.life < s.maxLife
            })

            frameRef.current = requestAnimationFrame(animate)
        }

        frameRef.current = requestAnimationFrame(animate)

        return () => {
            cancelAnimationFrame(frameRef.current)
            ro.disconnect()
        }
    }, [initStars])

    return (
        <div
            ref={containerRef}
            style={{
                ...props.style,
                position: "relative",
                overflow: "hidden",
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    display: "block",
                    position: "absolute",
                    inset: 0,
                }}
            />
        </div>
    )
}

// ─── Property Controls ────────────────────────────────────

StarfieldBackdrop.defaultProps = {
    starCount: 200,
    starColor: "#ffffff",
    starMinSize: 0.3,
    starMaxSize: 2,
    twinkleSpeed: 50,
    shootingStarFrequency: 3,
    shootingStarColor: "#ffffff",
    shootingStarLength: 80,
    shootingStarSpeed: 6,
    bgColor: "#0a0e27",
    bgGradient: true,
    bgGradientCenter: "#1a1040",
    bgGradientEdge: "#060818",
    depth: true,
    glowIntensity: 0.5,
}

addPropertyControls(StarfieldBackdrop, {
    // ─── Stars ────────────────────
    starCount: {
        type: ControlType.Number,
        title: "Stars",
        min: 20,
        max: 800,
        step: 10,
        defaultValue: 200,
        description: "Number of stars",
    },
    starColor: {
        type: ControlType.Color,
        title: "Star Color",
        defaultValue: "#ffffff",
    },
    starMinSize: {
        type: ControlType.Number,
        title: "Min Size",
        min: 0.1,
        max: 2,
        step: 0.1,
        defaultValue: 0.3,
    },
    starMaxSize: {
        type: ControlType.Number,
        title: "Max Size",
        min: 0.5,
        max: 5,
        step: 0.1,
        defaultValue: 2,
    },
    depth: {
        type: ControlType.Boolean,
        title: "Depth Variation",
        defaultValue: true,
        description: "Vary star size and brightness to simulate depth",
    },
    glowIntensity: {
        type: ControlType.Number,
        title: "Glow",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.5,
        description: "Soft glow around brighter stars",
    },
    twinkleSpeed: {
        type: ControlType.Number,
        title: "Twinkle Speed",
        min: 0,
        max: 100,
        step: 5,
        defaultValue: 50,
    },

    // ─── Shooting Stars ───────────
    shootingStarFrequency: {
        type: ControlType.Number,
        title: "Frequency",
        min: 0,
        max: 20,
        step: 1,
        defaultValue: 3,
        description: "Shooting stars per ~10 seconds. 0 = off.",
    },
    shootingStarColor: {
        type: ControlType.Color,
        title: "Trail Color",
        defaultValue: "#ffffff",
    },
    shootingStarLength: {
        type: ControlType.Number,
        title: "Trail Length",
        min: 20,
        max: 250,
        step: 10,
        defaultValue: 80,
    },
    shootingStarSpeed: {
        type: ControlType.Number,
        title: "Trail Speed",
        min: 1,
        max: 20,
        step: 1,
        defaultValue: 6,
    },

    // ─── Background ───────────────
    bgGradient: {
        type: ControlType.Boolean,
        title: "Gradient BG",
        defaultValue: true,
    },
    bgColor: {
        type: ControlType.Color,
        title: "BG Color",
        defaultValue: "#0a0e27",
        hidden: (props) => props.bgGradient,
    },
    bgGradientCenter: {
        type: ControlType.Color,
        title: "BG Center",
        defaultValue: "#1a1040",
        hidden: (props) => !props.bgGradient,
    },
    bgGradientEdge: {
        type: ControlType.Color,
        title: "BG Edge",
        defaultValue: "#060818",
        hidden: (props) => !props.bgGradient,
    },
})

export default StarfieldBackdrop
