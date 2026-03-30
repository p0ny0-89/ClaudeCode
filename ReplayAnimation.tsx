import { addPropertyControls, ControlType } from "framer"
import { motion, useAnimation } from "framer-motion"
import { useCallback, useRef, useState } from "react"

/**
 * ReplayAnimation — Framer component
 *
 * A fixed refresh button for demo sites. On click it:
 *   1. Dispatches "choreographer:exit" so your page choreographer plays exit animations
 *   2. Waits for the exit duration to finish
 *   3. Refreshes the page — entrance animations replay naturally on load
 *
 * In your page choreographer, listen for the exit event:
 *   window.addEventListener("choreographer:exit", (e) => {
 *     const { duration } = e.detail
 *     // trigger your exit animations here
 *   })
 */

export default function ReplayAnimation({
    label,
    exitDuration,
    iconSize,
    iconColor,
    fontSize,
    fontFamily,
    fontWeight,
    textColor,
    bgColor,
    hoverBgColor,
    borderRadius,
    paddingX,
    paddingY,
    gap,
    shadow,
    showIcon,
    style,
}: Props) {
    const [isPlaying, setIsPlaying] = useState(false)
    const iconControls = useAnimation()
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleReplay = useCallback(() => {
        if (isPlaying) return
        setIsPlaying(true)

        // Spin the icon during exit
        iconControls.start({
            rotate: [0, 360],
            transition: { duration: exitDuration / 1000, ease: "easeInOut" },
        })

        // Tell the page choreographer to play exit animations
        window.dispatchEvent(
            new CustomEvent("choreographer:exit", {
                detail: { duration: exitDuration },
            })
        )

        // After exit completes, refresh the page
        timeoutRef.current = setTimeout(() => {
            window.location.reload()
        }, exitDuration)
    }, [isPlaying, exitDuration, iconControls])

    return (
        <motion.button
            onClick={handleReplay}
            style={{
                ...buttonReset,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap,
                background: bgColor,
                color: textColor,
                borderRadius,
                paddingLeft: paddingX,
                paddingRight: paddingX,
                paddingTop: paddingY,
                paddingBottom: paddingY,
                fontSize,
                fontFamily,
                fontWeight,
                boxShadow: shadow,
                cursor: isPlaying ? "default" : "pointer",
                opacity: isPlaying ? 0.7 : 1,
                transition: "opacity 0.2s",
                ...style,
            }}
            whileHover={!isPlaying ? { background: hoverBgColor } : {}}
            whileTap={!isPlaying ? { scale: 0.96 } : {}}
        >
            {showIcon && (
                <motion.svg
                    animate={iconControls}
                    width={iconSize}
                    height={iconSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={iconColor}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                >
                    <path d="M1 4v6h6" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </motion.svg>
            )}
            {label && <span>{label}</span>}
        </motion.button>
    )
}

// ── Defaults & types ─────────────────────────────────────────────────

const defaultProps = {
    label: "Replay",
    exitDuration: 800,
    iconSize: 18,
    iconColor: "#ffffff",
    fontSize: 14,
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 600,
    textColor: "#ffffff",
    bgColor: "rgba(0,0,0,0.75)",
    hoverBgColor: "rgba(0,0,0,0.9)",
    borderRadius: 100,
    paddingX: 20,
    paddingY: 10,
    gap: 8,
    shadow: "0 2px 8px rgba(0,0,0,0.25)",
    showIcon: true,
}

interface Props {
    label: string
    exitDuration: number
    iconSize: number
    iconColor: string
    fontSize: number
    fontFamily: string
    fontWeight: number
    textColor: string
    bgColor: string
    hoverBgColor: string
    borderRadius: number
    paddingX: number
    paddingY: number
    gap: number
    shadow: string
    showIcon: boolean
    style?: React.CSSProperties
}

ReplayAnimation.defaultProps = defaultProps

// ── Property controls ────────────────────────────────────────────────

addPropertyControls(ReplayAnimation, {
    label: {
        title: "Label",
        type: ControlType.String,
        defaultValue: defaultProps.label,
    },
    showIcon: {
        title: "Show Icon",
        type: ControlType.Boolean,
        defaultValue: defaultProps.showIcon,
    },
    exitDuration: {
        title: "Exit Duration",
        type: ControlType.Number,
        defaultValue: defaultProps.exitDuration,
        min: 100,
        max: 3000,
        step: 50,
        unit: "ms",
        description:
            "How long to wait for exit animations before refreshing the page.",
    },
    iconSize: {
        title: "Icon Size",
        type: ControlType.Number,
        defaultValue: defaultProps.iconSize,
        min: 10,
        max: 48,
        step: 1,
    },
    iconColor: {
        title: "Icon Color",
        type: ControlType.Color,
        defaultValue: defaultProps.iconColor,
        hidden: (props) => !props.showIcon,
    },
    fontSize: {
        title: "Font Size",
        type: ControlType.Number,
        defaultValue: defaultProps.fontSize,
        min: 10,
        max: 32,
        step: 1,
    },
    fontFamily: {
        title: "Font",
        type: ControlType.String,
        defaultValue: defaultProps.fontFamily,
    },
    fontWeight: {
        title: "Weight",
        type: ControlType.Number,
        defaultValue: defaultProps.fontWeight,
        min: 100,
        max: 900,
        step: 100,
    },
    textColor: {
        title: "Text Color",
        type: ControlType.Color,
        defaultValue: defaultProps.textColor,
    },
    bgColor: {
        title: "Background",
        type: ControlType.Color,
        defaultValue: defaultProps.bgColor,
    },
    hoverBgColor: {
        title: "Hover BG",
        type: ControlType.Color,
        defaultValue: defaultProps.hoverBgColor,
    },
    borderRadius: {
        title: "Radius",
        type: ControlType.Number,
        defaultValue: defaultProps.borderRadius,
        min: 0,
        max: 100,
        step: 1,
    },
    paddingX: {
        title: "Padding X",
        type: ControlType.Number,
        defaultValue: defaultProps.paddingX,
        min: 0,
        max: 48,
        step: 2,
    },
    paddingY: {
        title: "Padding Y",
        type: ControlType.Number,
        defaultValue: defaultProps.paddingY,
        min: 0,
        max: 48,
        step: 2,
    },
    gap: {
        title: "Gap",
        type: ControlType.Number,
        defaultValue: defaultProps.gap,
        min: 0,
        max: 24,
        step: 1,
    },
    shadow: {
        title: "Shadow",
        type: ControlType.String,
        defaultValue: defaultProps.shadow,
    },
})

// ── Helpers ──────────────────────────────────────────────────────────

const buttonReset: React.CSSProperties = {
    border: "none",
    outline: "none",
    WebkitAppearance: "none",
    appearance: "none",
    userSelect: "none",
}
