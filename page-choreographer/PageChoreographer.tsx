// ─── Page Choreographer ──────────────────────────────────────────────────────
// The ONLY component you need. Drop one per section/group of elements.
// The first instance automatically sets up:
//   • The shared animation store
//   • Link click interception (exit animations before navigation)
//   • Enter animation playback on page load
//
// Each instance has its OWN animation settings (duration, easing, stagger, etc.)
// so different sections can have completely different effects.
//
// Presets provide quick common effects. Choose "Custom" for full control over
// opacity, offset X/Y, scale, rotate, and blur — matching Framer's native
// appear effect level of control.

import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

var STORE_KEY = "__pageChoreographerStore_v2"

// ─── Easing presets ──────────────────────────────────────────────────────────

var EASING_MAP: Record<string, number[]> = {
    smooth: [0.4, 0, 0.2, 1],
    snappy: [0.16, 1, 0.3, 1],
    dramatic: [0.76, 0, 0.24, 1],
    gentle: [0.25, 0.1, 0.25, 1],
    bounce: [0.34, 1.56, 0.64, 1],
    linear: [0, 0, 1, 1],
}

function easingToCss(e: number[]): string {
    return "cubic-bezier(" + e[0] + "," + e[1] + "," + e[2] + "," + e[3] + ")"
}

// ─── Keyframe builders ───────────────────────────────────────────────────────

function buildEnterKeyframes(t: TargetEntry) {
    if (t.enterPreset === "custom") {
        var from: any = { opacity: String(t.enterOpacity) }
        var to: any = { opacity: "1" }

        var has3D = t.enterRotateX !== 0 || t.enterRotateY !== 0
        var persp = has3D && t.enterPerspective > 0
            ? "perspective(" + t.enterPerspective + "px) " : ""

        from.transform = persp +
            "translateX(" + t.enterOffsetX + "px) " +
            "translateY(" + t.enterOffsetY + "px) " +
            "scale(" + t.enterScale + ") " +
            "rotateX(" + t.enterRotateX + "deg) " +
            "rotateY(" + t.enterRotateY + "deg) " +
            "rotateZ(" + t.enterRotateZ + "deg)"
        to.transform = persp +
            "translateX(0px) translateY(0px) scale(1) " +
            "rotateX(0deg) rotateY(0deg) rotateZ(0deg)"

        if (t.enterBlur > 0) {
            from.filter = "blur(" + t.enterBlur + "px)"
            to.filter = "blur(0px)"
        }

        return { from: from, to: to }
    }

    var d = t.distance
    switch (t.enterPreset) {
        case "fadeDown":
            return {
                from: { opacity: "0", transform: "translateY(" + -d + "px)" },
                to: { opacity: "1", transform: "translateY(0px)" },
            }
        case "fadeLeft":
            return {
                from: { opacity: "0", transform: "translateX(" + d + "px)" },
                to: { opacity: "1", transform: "translateX(0px)" },
            }
        case "fadeRight":
            return {
                from: { opacity: "0", transform: "translateX(" + -d + "px)" },
                to: { opacity: "1", transform: "translateX(0px)" },
            }
        case "scaleIn":
            return {
                from: { opacity: "0", transform: "scale(" + t.scaleFrom + ")" },
                to: { opacity: "1", transform: "scale(1)" },
            }
        case "blurIn":
            return {
                from: {
                    opacity: "0",
                    filter: "blur(" + t.blurAmount + "px)",
                },
                to: { opacity: "1", filter: "blur(0px)" },
            }
        case "maskRevealX":
            return {
                from: { clipPath: "inset(0 100% 0 0)" },
                to: { clipPath: "inset(0 0% 0 0)" },
            }
        case "maskRevealY":
            return {
                from: { clipPath: "inset(100% 0 0 0)" },
                to: { clipPath: "inset(0% 0 0 0)" },
            }
        case "fadeUp":
        default:
            return {
                from: { opacity: "0", transform: "translateY(" + d + "px)" },
                to: { opacity: "1", transform: "translateY(0px)" },
            }
    }
}

function buildExitKeyframes(t: TargetEntry) {
    if (t.exitPreset === "custom") {
        var from: any = { opacity: "1" }
        var to: any = { opacity: String(t.exitOpacity) }

        var has3D = t.exitRotateX !== 0 || t.exitRotateY !== 0
        var persp = has3D && t.exitPerspective > 0
            ? "perspective(" + t.exitPerspective + "px) " : ""

        from.transform = persp +
            "translateX(0px) translateY(0px) scale(1) " +
            "rotateX(0deg) rotateY(0deg) rotateZ(0deg)"
        to.transform = persp +
            "translateX(" + t.exitOffsetX + "px) " +
            "translateY(" + t.exitOffsetY + "px) " +
            "scale(" + t.exitScale + ") " +
            "rotateX(" + t.exitRotateX + "deg) " +
            "rotateY(" + t.exitRotateY + "deg) " +
            "rotateZ(" + t.exitRotateZ + "deg)"

        if (t.exitBlur > 0) {
            from.filter = "blur(0px)"
            to.filter = "blur(" + t.exitBlur + "px)"
        }

        return { from: from, to: to }
    }

    var d = t.distance
    switch (t.exitPreset) {
        case "blurLift":
            return {
                from: {
                    opacity: "1",
                    transform: "translateY(0px)",
                    filter: "blur(0px)",
                },
                to: {
                    opacity: "0",
                    transform: "translateY(" + -(d * 0.5) + "px)",
                    filter: "blur(" + t.blurAmount + "px)",
                },
            }
        case "scaleFadeGrid":
            return {
                from: { opacity: "1", transform: "scale(1)" },
                to: { opacity: "0", transform: "scale(" + t.scaleFrom + ")" },
            }
        case "fadeDown":
            return {
                from: { opacity: "1", transform: "translateY(0px)" },
                to: { opacity: "0", transform: "translateY(" + d + "px)" },
            }
        case "fadeLeft":
            return {
                from: { opacity: "1", transform: "translateX(0px)" },
                to: { opacity: "0", transform: "translateX(" + -d + "px)" },
            }
        case "fadeRight":
            return {
                from: { opacity: "1", transform: "translateX(0px)" },
                to: { opacity: "0", transform: "translateX(" + d + "px)" },
            }
        case "scaleOut":
            return {
                from: { opacity: "1", transform: "scale(1)" },
                to: { opacity: "0", transform: "scale(" + t.scaleFrom + ")" },
            }
        case "riseWave":
        default:
            return {
                from: { opacity: "1", transform: "translateY(0px)" },
                to: { opacity: "0", transform: "translateY(" + -d + "px)" },
            }
    }
}

// ─── Store (singleton on window) ─────────────────────────────────────────────

interface TargetEntry {
    id: string
    ref: { current: HTMLElement | null }
    groupId: string
    enterPreset: string
    exitPreset: string
    enterEnabled: boolean
    exitEnabled: boolean
    sortPriority: number
    delayOffset: number
    mobileEnabled: boolean
    trigger: string
    duration: number
    stagger: number
    easing: number[]
    staggerDirection: string
    distance: number
    blurAmount: number
    scaleFrom: number
    // Custom enter
    enterOpacity: number
    enterOffsetX: number
    enterOffsetY: number
    enterScale: number
    enterRotateX: number
    enterRotateY: number
    enterRotateZ: number
    enterBlur: number
    enterPerspective: number
    // Custom exit
    exitOpacity: number
    exitOffsetX: number
    exitOffsetY: number
    exitScale: number
    exitRotateX: number
    exitRotateY: number
    exitRotateZ: number
    exitBlur: number
    exitPerspective: number
}

function createStore() {
    var targets: Record<string, TargetEntry> = {}
    var activeAnims: Animation[] = []
    var phase = "idle"
    var overlay: HTMLDivElement | null = null
    var linkInterceptionSetup = false
    var skipNextClick = false
    var exitTimeout = 3
    // WeakSet tracks DOM elements that have already been enter-animated.
    // React re-renders reuse the same DOM nodes → elements stay in set → skip.
    // Replay/reload/navigation creates fresh DOM nodes → not in set → animate.
    var animatedElements: WeakSet<Element> | null =
        typeof WeakSet !== "undefined" ? new WeakSet<Element>() : null

    function registerTarget(t: TargetEntry) {
        targets[t.id] = t
    }

    function unregisterTarget(id: string) {
        delete targets[id]
    }

    function getTargetCount() {
        return Object.keys(targets).length
    }

    function getAllTargets() {
        var result: TargetEntry[] = []
        for (var id in targets) {
            if (targets[id].ref.current) result.push(targets[id])
        }
        return result
    }

    function sortTargets(list: TargetEntry[], direction: string) {
        var sorted = list.slice()
        sorted.sort(function (a, b) {
            if (a.sortPriority !== b.sortPriority)
                return a.sortPriority - b.sortPriority
            var elA = a.ref.current
            var elB = b.ref.current
            if (!elA || !elB) return 0
            var rA = elA.getBoundingClientRect()
            var rB = elB.getBoundingClientRect()
            var cxA = rA.left + rA.width / 2
            var cyA = rA.top + rA.height / 2
            var cxB = rB.left + rB.width / 2
            var cyB = rB.top + rB.height / 2
            switch (direction) {
                case "rightToLeft":
                    return cxB - cxA
                case "topToBottom":
                    return cyA - cyB
                case "bottomToTop":
                    return cyB - cyA
                case "rowMajor": {
                    var rowA = Math.round(rA.top / 80)
                    var rowB = Math.round(rB.top / 80)
                    if (rowA !== rowB) return rowA - rowB
                    return cxA - cxB
                }
                case "columnMajor": {
                    var colA = Math.round(rA.left / 200)
                    var colB = Math.round(rB.left / 200)
                    if (colA !== colB) return colA - colB
                    return cyA - cyB
                }
                case "leftToRight":
                default:
                    return cxA - cxB
            }
        })
        return sorted
    }

    function cancelActive() {
        for (var i = 0; i < activeAnims.length; i++) {
            try { activeAnims[i].cancel() } catch (e) {}
        }
        activeAnims = []
    }

    function lockInteractions() {
        if (overlay) return
        overlay = document.createElement("div")
        overlay.style.cssText =
            "position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;cursor:wait;"
        document.body.appendChild(overlay)
    }

    function unlockInteractions() {
        if (overlay) {
            overlay.remove()
            overlay = null
        }
    }

    function groupByGroupId(list: TargetEntry[]): Record<string, TargetEntry[]> {
        var groups: Record<string, TargetEntry[]> = {}
        for (var i = 0; i < list.length; i++) {
            var t = list[i]
            if (!groups[t.groupId]) groups[t.groupId] = []
            groups[t.groupId].push(t)
        }
        return groups
    }

    // Sort group IDs by their priority (ascending), so lower priority
    // numbers animate first. Groups with the same priority play together.
    function getSortedGroupIds(groups: Record<string, TargetEntry[]>): string[] {
        var gids = Object.keys(groups)
        gids.sort(function (a, b) {
            return groups[a][0].sortPriority - groups[b][0].sortPriority
        })
        return gids
    }

    function playEnter() {
        var reduced =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        var mobile = window.innerWidth < 768

        // Only auto-play "onLoad" targets — "inView" targets are
        // triggered independently by IntersectionObserver.
        // Skip elements already animated (WeakSet tracks DOM nodes).
        var eligible = getAllTargets().filter(function (t) {
            var el = t.ref.current
            return t.trigger === "onLoad" && t.enterEnabled &&
                (t.mobileEnabled || !mobile) && el &&
                !(animatedElements && animatedElements.has(el))
        })

        if (eligible.length === 0) return Promise.resolve()
        phase = "entering"

        var groups = groupByGroupId(eligible)
        var sortedGids = getSortedGroupIds(groups)
        var promises: Promise<any>[] = []
        var groupOffset = 0
        var prevPriority: number | null = null

        for (var gi = 0; gi < sortedGids.length; gi++) {
            var gid = sortedGids[gi]
            var group = groups[gid]
            var currentPriority = group[0].sortPriority
            var direction = group[0].staggerDirection
            var sorted = sortTargets(group, direction)

            // Same priority as previous group → no extra offset (play together)
            // Different priority → advance offset so this group starts after the last
            if (prevPriority !== null && currentPriority !== prevPriority) {
                // groupOffset was already accumulated from previous groups
            }

            var maxDelayInGroup = 0

            for (var i = 0; i < sorted.length; i++) {
                var target = sorted[i]
                var el = target.ref.current
                if (!el) continue

                var kf = reduced
                    ? { from: { opacity: "0" }, to: { opacity: "1" } }
                    : buildEnterKeyframes(target)

                var stagger = reduced ? 0 : target.stagger
                var localDelay = stagger * i + target.delayOffset
                var delay = localDelay + groupOffset
                var dur = reduced ? 10 : target.duration * 1000

                if (localDelay > maxDelayInGroup) maxDelayInGroup = localDelay

                // Mark element as animated BEFORE starting so re-renders
                // during the animation won't try to animate it again
                if (animatedElements) animatedElements.add(el)

                // Block hover/click during animation to prevent Framer's
                // hover variants from triggering re-renders mid-animation
                el.style.pointerEvents = "none"

                try {
                    var anim = el.animate([kf.from, kf.to], {
                        duration: dur,
                        delay: delay * 1000,
                        easing: easingToCss(target.easing),
                        fill: "both",
                    })
                    activeAnims.push(anim)

                    promises.push(
                        anim.finished.then(
                            (function (a, e) {
                                return function () {
                                    // Restore pointer events so hover effects work
                                    e.style.pointerEvents = ""
                                    try { a.cancel() } catch (ex) {}
                                }
                            })(anim, el)
                        )
                    )
                } catch (e) {
                    el.style.pointerEvents = ""
                }
            }

            // If the NEXT group has a different priority, advance the offset
            // so it starts after this group's last element begins animating
            var nextGid = sortedGids[gi + 1]
            if (nextGid) {
                var nextPriority = groups[nextGid][0].sortPriority
                if (nextPriority !== currentPriority) {
                    groupOffset += maxDelayInGroup + (sorted.length > 0 ? sorted[0].stagger : 0.06)
                }
            }
            prevPriority = currentPriority
        }

        return Promise.all(promises).then(function () {
            activeAnims = []
            phase = "done"
        })
    }

    function playExit() {
        if (phase === "exiting") return Promise.resolve()
        cancelActive()
        phase = "exiting"
        // Clear animated tracking so enter animations replay on next page
        animatedElements = typeof WeakSet !== "undefined" ? new WeakSet() : null
        lockInteractions()

        var reduced =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        var mobile = window.innerWidth < 768

        var eligible = getAllTargets().filter(function (t) {
            return t.exitEnabled && (t.mobileEnabled || !mobile) && t.ref.current
        })

        var groups = groupByGroupId(eligible)
        var sortedGids = getSortedGroupIds(groups)
        var promises: Promise<any>[] = []
        var groupOffset = 0
        var prevPriority: number | null = null

        for (var gi = 0; gi < sortedGids.length; gi++) {
            var gid = sortedGids[gi]
            var group = groups[gid]
            var currentPriority = group[0].sortPriority
            var direction = group[0].staggerDirection
            var sorted = sortTargets(group, direction)

            var maxDelayInGroup = 0

            for (var i = 0; i < sorted.length; i++) {
                var target = sorted[i]
                var el = target.ref.current
                if (!el) continue

                var kf = reduced
                    ? { from: { opacity: "1" }, to: { opacity: "0" } }
                    : buildExitKeyframes(target)

                var stagger = reduced ? 0 : target.stagger
                var localDelay = stagger * i + target.delayOffset
                var delay = localDelay + groupOffset

                if (localDelay > maxDelayInGroup) maxDelayInGroup = localDelay

                try {
                    var anim = el.animate([kf.from, kf.to], {
                        duration: reduced ? 10 : target.duration * 1000,
                        delay: delay * 1000,
                        easing: easingToCss(target.easing),
                        fill: "forwards",
                    })
                    activeAnims.push(anim)
                    promises.push(anim.finished)
                } catch (e) {}
            }

            var nextGid = sortedGids[gi + 1]
            if (nextGid) {
                var nextPriority = groups[nextGid][0].sortPriority
                if (nextPriority !== currentPriority) {
                    groupOffset += maxDelayInGroup + (sorted.length > 0 ? sorted[0].stagger : 0.06)
                }
            }
            prevPriority = currentPriority
        }

        return Promise.all(promises).then(function () {
            activeAnims = []
            unlockInteractions()
            phase = "done"
        })
    }

    // ─── Reset a group so it can be re-animated (used by viewRepeat) ────────

    function resetGroup(groupId: string) {
        if (!animatedElements) return
        var all = getAllTargets()
        for (var i = 0; i < all.length; i++) {
            if (all[i].groupId === groupId && all[i].ref.current) {
                animatedElements.delete(all[i].ref.current!)
            }
        }
    }

    // ─── Play enter for a single group (used by IntersectionObserver) ───────

    function playEnterGroup(groupId: string) {
        var reduced =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        var mobile = window.innerWidth < 768

        var eligible = getAllTargets().filter(function (t) {
            var el = t.ref.current
            return t.groupId === groupId && t.enterEnabled &&
                (t.mobileEnabled || !mobile) && el &&
                !(animatedElements && animatedElements.has(el))
        })

        if (eligible.length === 0) return Promise.resolve()

        var direction = eligible[0].staggerDirection
        var sorted = sortTargets(eligible, direction)
        var promises: Promise<any>[] = []

        for (var i = 0; i < sorted.length; i++) {
            var target = sorted[i]
            var el = target.ref.current
            if (!el) continue

            if (animatedElements) animatedElements.add(el)

            // Block hover during animation
            el.style.pointerEvents = "none"

            var kf = reduced
                ? { from: { opacity: "0" }, to: { opacity: "1" } }
                : buildEnterKeyframes(target)

            var stagger = reduced ? 0 : target.stagger
            var delay = stagger * i + target.delayOffset
            var dur = reduced ? 10 : target.duration * 1000

            try {
                var anim = el.animate([kf.from, kf.to], {
                    duration: dur,
                    delay: delay * 1000,
                    easing: easingToCss(target.easing),
                    fill: "both",
                })
                activeAnims.push(anim)

                promises.push(
                    anim.finished.then(
                        (function (a, e) {
                            return function () {
                                e.style.pointerEvents = ""
                                try { a.cancel() } catch (ex) {}
                            }
                        })(anim, el)
                    )
                )
            } catch (e) {
                el.style.pointerEvents = ""
            }
        }

        return Promise.all(promises)
    }

    // ─── Link interception ───────────────────────────────────────────────────

    function setupLinkInterception(timeout: number) {
        exitTimeout = timeout
        if (linkInterceptionSetup) return
        linkInterceptionSetup = true

        function findAnchor(target: EventTarget | null): HTMLAnchorElement | null {
            var node = target as HTMLElement | null
            while (node && node !== document.body) {
                if (node.tagName === "A") return node as HTMLAnchorElement
                node = node.parentElement
            }
            return null
        }

        function shouldIntercept(anchor: HTMLAnchorElement): boolean {
            if (!anchor.href) return false
            if (anchor.hasAttribute("data-no-exit")) return false
            if (anchor.target === "_blank") return false
            try {
                var url = new URL(anchor.href, window.location.origin)
                if (url.origin !== window.location.origin) return false
                if (url.pathname === window.location.pathname && url.hash) return false
            } catch (e) {
                return false
            }
            return true
        }

        function navigateViaAnchor(anchor: HTMLAnchorElement) {
            skipNextClick = true
            anchor.click()
        }

        document.addEventListener("click", function (e: MouseEvent) {
            if (skipNextClick) { skipNextClick = false; return }
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

            var anchor = findAnchor(e.target)
            if (!anchor) return
            if (!shouldIntercept(anchor)) return
            if (getTargetCount() === 0) return

            e.preventDefault()
            e.stopPropagation()

            Promise.race([
                playExit(),
                new Promise(function (resolve) {
                    setTimeout(resolve, exitTimeout * 1000)
                }),
            ])
                .then(function () { navigateViaAnchor(anchor) })
                .catch(function () { navigateViaAnchor(anchor) })
        }, true)
    }

    // ─── Auto enter ──────────────────────────────────────────────────────────

    var scheduleTimer: any = null

    function scheduleEnter(delay: number) {
        // Debounce: each call resets the timer so we wait for all
        // components to finish registering before playing.
        // The WeakSet inside playEnter handles idempotency —
        // already-animated DOM elements are skipped automatically.
        if (scheduleTimer) clearTimeout(scheduleTimer)
        scheduleTimer = setTimeout(function () {
            scheduleTimer = null
            var delayMs = delay * 1000
            if (delayMs > 0) {
                setTimeout(function () { playEnter() }, delayMs)
            } else {
                playEnter()
            }
        }, 50)
    }

    return {
        registerTarget: registerTarget,
        unregisterTarget: unregisterTarget,
        getTargetCount: getTargetCount,
        playEnter: playEnter,
        playEnterGroup: playEnterGroup,
        resetGroup: resetGroup,
        playExit: playExit,
        cancelActive: cancelActive,
        setupLinkInterception: setupLinkInterception,
        scheduleEnter: scheduleEnter,
    }
}

function getStore() {
    if (typeof window !== "undefined") {
        if (!(window as any)[STORE_KEY]) {
            ;(window as any)[STORE_KEY] = createStore()
        }
        return (window as any)[STORE_KEY]
    }
    return null
}

// ─── DOM scanning ────────────────────────────────────────────────────────────

function findRealParent(marker: HTMLElement): HTMLElement | null {
    var node = marker.parentElement
    var maxDepth = 5
    while (node && maxDepth > 0) {
        var count = 0
        for (var i = 0; i < node.children.length; i++) count++
        if (count > 1) return node
        node = node.parentElement
        maxDepth--
    }
    return node
}

function isMarkerBranch(el: HTMLElement, marker: HTMLElement): boolean {
    return el === marker || el.contains(marker)
}

function findNodeWithMostChildren(
    root: HTMLElement,
    marker: HTMLElement
): HTMLElement | null {
    var best: HTMLElement | null = null
    var bestCount = 0
    function walk(node: HTMLElement) {
        var contentCount = 0
        for (var i = 0; i < node.children.length; i++) {
            if (!isMarkerBranch(node.children[i] as HTMLElement, marker))
                contentCount++
        }
        if (contentCount >= 2 && contentCount > bestCount) {
            bestCount = contentCount
            best = node
        }
        for (var j = 0; j < node.children.length; j++) {
            var child = node.children[j] as HTMLElement
            if (!isMarkerBranch(child, marker)) walk(child)
        }
    }
    walk(root)
    return best
}

function nodeMatchesNames(node: HTMLElement, names: string[]): boolean {
    var attrs = ["data-framer-name", "data-framer-component", "aria-label"]
    for (var a = 0; a < attrs.length; a++) {
        var val = (node.getAttribute(attrs[a]) || "").toLowerCase()
        if (!val) continue
        for (var n = 0; n < names.length; n++) {
            if (val === names[n] || val.indexOf(names[n]) !== -1) return true
        }
    }
    // Check trimmed text content (only if short — avoids matching paragraphs)
    var text = (node.textContent || "").trim().toLowerCase()
    if (text.length > 0 && text.length < 60) {
        for (var n = 0; n < names.length; n++) {
            if (text === names[n]) return true
        }
    }
    return false
}

function elementMatchesNames(el: HTMLElement, names: string[]): boolean {
    // Check element itself
    if (nodeMatchesNames(el, names)) return true
    // Check all descendants
    try {
        var all = el.querySelectorAll("*")
        for (var i = 0; i < all.length; i++) {
            if (nodeMatchesNames(all[i] as HTMLElement, names)) return true
        }
    } catch (e) {}
    return false
}

function collectTargets(
    parent: HTMLElement,
    marker: HTMLElement,
    scanMode: string,
    excludeSelector?: string
): HTMLElement[] {
    var result: HTMLElement[] = []
    if (scanMode === "cmsItems") {
        var listNode = findNodeWithMostChildren(parent, marker)
        if (listNode) {
            for (var j = 0; j < listNode.children.length; j++) {
                var child = listNode.children[j] as HTMLElement
                if (!isMarkerBranch(child, marker)) result.push(child)
            }
        }
    } else {
        for (var k = 0; k < parent.children.length; k++) {
            var el = parent.children[k] as HTMLElement
            if (isMarkerBranch(el, marker)) continue
            result.push(el)
        }
    }
    // Filter out elements whose layer name matches any excluded name.
    // User types comma-separated layer names like "Load More, Footer".
    // Checks data-framer-name, data-framer-component, aria-label, and
    // trimmed text content — on the element itself and its descendants.
    if (excludeSelector && excludeSelector.trim()) {
        var names = excludeSelector.split(",").map(function (n) {
            return n.trim().toLowerCase()
        }).filter(function (n) { return n.length > 0 })

        if (names.length > 0) {
            result = result.filter(function (el) {
                return !elementMatchesNames(el, names)
            })
        }
    }
    return result
}

// ─── Component ───────────────────────────────────────────────────────────────

var groupCounter = 0
function useStableGroupId() {
    var ref = React.useRef("")
    if (ref.current === "") {
        groupCounter += 1
        ref.current = "scan-" + groupCounter
    }
    return ref.current
}

export default function PageChoreographer(props: any) {
    var {
        scanMode = "cmsItems",
        excludeSelector = "",
        enterPreset = "fadeUp",
        exitPreset = "riseWave",
        enterEnabled = true,
        exitEnabled = true,
        mobileEnabled = true,
        trigger = "onLoad",
        viewOffset = 100,
        viewRepeat = false,
        sortPriority = 0,
        delayOffset = 0,
        duration = 0.6,
        stagger = 0.06,
        easingPreset = "smooth",
        staggerDirection = "leftToRight",
        distance = 40,
        blurAmount = 8,
        scaleFrom = 0.92,
        exitTimeout = 3,
        enterDelay = 0.05,
        // Custom enter
        enterOpacity = 0,
        enterOffsetX = 0,
        enterOffsetY = 40,
        enterScale = 1,
        enterRotateX = 0,
        enterRotateY = 0,
        enterRotateZ = 0,
        enterBlur = 0,
        enterPerspective = 1000,
        // Custom exit
        exitOpacity = 0,
        exitOffsetX = 0,
        exitOffsetY = -40,
        exitScale = 1,
        exitRotateX = 0,
        exitRotateY = 0,
        exitRotateZ = 0,
        exitBlur = 0,
        exitPerspective = 1000,
        style,
    } = props

    var markerRef = React.useRef(null) as React.MutableRefObject<HTMLDivElement | null>
    var baseId = useStableGroupId()
    var registeredIds = React.useRef<string[]>([])

    function unregisterAll(store: any) {
        if (!store) return
        var ids = registeredIds.current
        for (var i = 0; i < ids.length; i++) {
            store.unregisterTarget(ids[i])
        }
        registeredIds.current = []
    }

    function registerElements(elements: HTMLElement[], store: any) {
        var easing = EASING_MAP[easingPreset] || EASING_MAP.smooth

        for (var i = 0; i < elements.length; i++) {
            var el = elements[i]
            var targetId = baseId + "-" + i

            store.registerTarget({
                id: targetId,
                ref: { current: el },
                groupId: baseId,
                enterPreset: enterPreset,
                exitPreset: exitPreset,
                enterEnabled: enterEnabled,
                exitEnabled: exitEnabled,
                sortPriority: sortPriority,
                delayOffset: delayOffset,
                mobileEnabled: mobileEnabled,
                trigger: trigger,
                duration: duration,
                stagger: stagger,
                easing: easing,
                staggerDirection: staggerDirection,
                distance: distance,
                blurAmount: blurAmount,
                scaleFrom: scaleFrom,
                enterOpacity: enterOpacity,
                enterOffsetX: enterOffsetX,
                enterOffsetY: enterOffsetY,
                enterScale: enterScale,
                enterRotateX: enterRotateX,
                enterRotateY: enterRotateY,
                enterRotateZ: enterRotateZ,
                enterBlur: enterBlur,
                enterPerspective: enterPerspective,
                exitOpacity: exitOpacity,
                exitOffsetX: exitOffsetX,
                exitOffsetY: exitOffsetY,
                exitScale: exitScale,
                exitRotateX: exitRotateX,
                exitRotateY: exitRotateY,
                exitRotateZ: exitRotateZ,
                exitBlur: exitBlur,
                exitPerspective: exitPerspective,
            })

            registeredIds.current.push(targetId)
        }
    }

    React.useEffect(function () {
        var store = getStore()
        var marker = markerRef.current
        if (!store || !marker) return

        store.setupLinkInterception(exitTimeout)

        // Only schedule global enter for "onLoad" groups
        if (trigger === "onLoad") {
            store.scheduleEnter(enterDelay)
        }

        var parent = findRealParent(marker)
        if (!parent) return

        unregisterAll(store)

        var targets = collectTargets(parent, marker, scanMode, excludeSelector)
        registerElements(targets, store)

        // MutationObserver for dynamic CMS content
        var observeTarget = parent
        if (scanMode === "cmsItems") {
            for (var i = 0; i < parent.children.length; i++) {
                var ch = parent.children[i] as HTMLElement
                if (isMarkerBranch(ch, marker)) continue
                if (ch.children.length > 1) {
                    observeTarget = ch
                    break
                }
            }
        }

        var mutObs: MutationObserver | null = null
        try {
            if (typeof MutationObserver !== "undefined") {
                mutObs = new MutationObserver(function () {
                    var s = getStore()
                    if (!s || !marker) return
                    var p = findRealParent(marker)
                    if (!p) return
                    unregisterAll(s)
                    var t = collectTargets(p, marker, scanMode, excludeSelector)
                    registerElements(t, s)
                })
                mutObs.observe(observeTarget, { childList: true })
            }
        } catch (e) {}

        // IntersectionObserver for "inView" trigger
        var intObs: IntersectionObserver | null = null
        if (trigger === "inView" && typeof IntersectionObserver !== "undefined") {
            var isVisible = false
            try {
                intObs = new IntersectionObserver(
                    function (entries) {
                        for (var e = 0; e < entries.length; e++) {
                            if (entries[e].isIntersecting && !isVisible) {
                                isVisible = true
                                var s = getStore()
                                if (s) s.playEnterGroup(baseId)
                                // If not repeating, stop observing
                                if (!viewRepeat && intObs) intObs.disconnect()
                            } else if (!entries[e].isIntersecting && isVisible && viewRepeat) {
                                // Element left viewport — clear from WeakSet so it replays
                                isVisible = false
                                var s2 = getStore()
                                if (s2) s2.resetGroup(baseId)
                            }
                        }
                    },
                    { rootMargin: "0px 0px " + viewOffset + "px 0px" }
                )
                intObs.observe(parent)
            } catch (e) {}
        }

        return function () {
            if (mutObs) {
                try { mutObs.disconnect() } catch (e) {}
            }
            if (intObs) {
                try { intObs.disconnect() } catch (e) {}
            }
            unregisterAll(getStore())
        }
    }, [
        baseId, scanMode, excludeSelector, trigger, viewOffset, viewRepeat,
        enterPreset, exitPreset,
        enterEnabled, exitEnabled, sortPriority, delayOffset,
        mobileEnabled, duration, stagger,
        easingPreset, staggerDirection, distance, blurAmount,
        scaleFrom, exitTimeout, enterDelay,
        enterOpacity, enterOffsetX, enterOffsetY,
        enterScale, enterRotateX, enterRotateY, enterRotateZ,
        enterBlur, enterPerspective,
        exitOpacity, exitOffsetX, exitOffsetY,
        exitScale, exitRotateX, exitRotateY, exitRotateZ,
        exitBlur, exitPerspective,
    ])

    return (
        <div
            ref={markerRef}
            style={{
                width: 0,
                height: 0,
                overflow: "hidden",
                pointerEvents: "none",
                opacity: 0,
            }}
        />
    )
}

PageChoreographer.displayName = "Page Choreographer"

// ─── Property Controls ───────────────────────────────────────────────────────

addPropertyControls(PageChoreographer, {
    scanMode: {
        type: ControlType.Enum,
        title: "Scan Mode",
        defaultValue: "cmsItems",
        options: ["siblings", "cmsItems"],
        optionTitles: ["Siblings", "CMS Items"],
    },
    excludeSelector: {
        type: ControlType.String,
        title: "Exclude",
        defaultValue: "",
        placeholder: "Layer Name",
        description:
            "Layer names to skip (comma-separated). e.g. Load More, Button",
    },
    trigger: {
        type: ControlType.Enum,
        title: "Trigger",
        defaultValue: "onLoad",
        options: ["onLoad", "inView"],
        optionTitles: ["On Load", "In View"],
    },
    viewOffset: {
        type: ControlType.Number,
        title: "View Offset",
        defaultValue: 100,
        min: -200,
        max: 500,
        step: 10,
        unit: "px",
        hidden: function (props: any) { return props.trigger !== "inView" },
    },
    viewRepeat: {
        type: ControlType.Boolean,
        title: "Repeat",
        defaultValue: false,
        hidden: function (props: any) { return props.trigger !== "inView" },
    },

    // ── Enter ────────────────────────────────────────────────────────────────

    enterEnabled: {
        type: ControlType.Boolean,
        title: "Enter",
        defaultValue: true,
    },
    enterPreset: {
        type: ControlType.Enum,
        title: "Enter Effect",
        defaultValue: "fadeUp",
        options: [
            "fadeUp", "fadeDown", "fadeLeft", "fadeRight",
            "maskRevealX", "maskRevealY", "scaleIn", "blurIn", "custom",
        ],
        optionTitles: [
            "Fade Up", "Fade Down", "Fade Left", "Fade Right",
            "Mask Reveal X", "Mask Reveal Y", "Scale In", "Blur In", "Custom",
        ],
        hidden: function (props: any) { return props.enterEnabled === false },
    },
    enterOpacity: {
        type: ControlType.Number,
        title: "↳ Opacity",
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterOffsetX: {
        type: ControlType.Number,
        title: "↳ Offset X",
        defaultValue: 0,
        min: -2000,
        max: 2000,
        step: 5,
        unit: "px",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterOffsetY: {
        type: ControlType.Number,
        title: "↳ Offset Y",
        defaultValue: 40,
        min: -2000,
        max: 2000,
        step: 5,
        unit: "px",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterScale: {
        type: ControlType.Number,
        title: "↳ Scale",
        defaultValue: 1,
        min: 0,
        max: 2,
        step: 0.01,
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterRotateX: {
        type: ControlType.Number,
        title: "↳ Rotate X",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterRotateY: {
        type: ControlType.Number,
        title: "↳ Rotate Y",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterRotateZ: {
        type: ControlType.Number,
        title: "↳ Rotate Z",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterPerspective: {
        type: ControlType.Number,
        title: "↳ Perspective",
        defaultValue: 1000,
        min: 100,
        max: 3000,
        step: 50,
        unit: "px",
        hidden: function (props: any) {
            if (props.enterEnabled === false || props.enterPreset !== "custom") return true
            return props.enterRotateX === 0 && props.enterRotateY === 0
        },
    },
    enterBlur: {
        type: ControlType.Number,
        title: "↳ Blur",
        defaultValue: 0,
        min: 0,
        max: 50,
        step: 1,
        unit: "px",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },

    // ── Exit ─────────────────────────────────────────────────────────────────

    exitEnabled: {
        type: ControlType.Boolean,
        title: "Exit",
        defaultValue: true,
    },
    exitPreset: {
        type: ControlType.Enum,
        title: "Exit Effect",
        defaultValue: "riseWave",
        options: [
            "riseWave", "fadeDown", "fadeLeft", "fadeRight",
            "blurLift", "scaleFadeGrid", "scaleOut", "custom",
        ],
        optionTitles: [
            "Rise Wave", "Fade Down", "Fade Left", "Fade Right",
            "Blur Lift", "Scale Fade", "Scale Out", "Custom",
        ],
        hidden: function (props: any) { return props.exitEnabled === false },
    },
    exitOpacity: {
        type: ControlType.Number,
        title: "↳ Opacity",
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitOffsetX: {
        type: ControlType.Number,
        title: "↳ Offset X",
        defaultValue: 0,
        min: -2000,
        max: 2000,
        step: 5,
        unit: "px",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitOffsetY: {
        type: ControlType.Number,
        title: "↳ Offset Y",
        defaultValue: -40,
        min: -2000,
        max: 2000,
        step: 5,
        unit: "px",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitScale: {
        type: ControlType.Number,
        title: "↳ Scale",
        defaultValue: 1,
        min: 0,
        max: 2,
        step: 0.01,
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitRotateX: {
        type: ControlType.Number,
        title: "↳ Rotate X",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitRotateY: {
        type: ControlType.Number,
        title: "↳ Rotate Y",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitRotateZ: {
        type: ControlType.Number,
        title: "↳ Rotate Z",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitPerspective: {
        type: ControlType.Number,
        title: "↳ Perspective",
        defaultValue: 1000,
        min: 100,
        max: 3000,
        step: 50,
        unit: "px",
        hidden: function (props: any) {
            if (props.exitEnabled === false || props.exitPreset !== "custom") return true
            return props.exitRotateX === 0 && props.exitRotateY === 0
        },
    },
    exitBlur: {
        type: ControlType.Number,
        title: "↳ Blur",
        defaultValue: 0,
        min: 0,
        max: 50,
        step: 1,
        unit: "px",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },

    // ── Timing ───────────────────────────────────────────────────────────────

    duration: {
        type: ControlType.Number,
        title: "Duration",
        defaultValue: 0.6,
        min: 0.1,
        max: 3,
        step: 0.05,
        unit: "s",
    },
    stagger: {
        type: ControlType.Number,
        title: "Stagger",
        defaultValue: 0.06,
        min: 0,
        max: 0.5,
        step: 0.01,
        unit: "s",
    },
    easingPreset: {
        type: ControlType.Enum,
        title: "Easing",
        defaultValue: "smooth",
        options: ["smooth", "snappy", "dramatic", "gentle", "bounce", "linear"],
        optionTitles: ["Smooth", "Snappy", "Dramatic", "Gentle", "Bounce", "Linear"],
    },
    staggerDirection: {
        type: ControlType.Enum,
        title: "Stagger Order",
        defaultValue: "leftToRight",
        options: [
            "leftToRight", "rightToLeft", "topToBottom",
            "bottomToTop", "rowMajor", "columnMajor",
        ],
        optionTitles: [
            "Left → Right", "Right → Left", "Top → Bottom",
            "Bottom → Top", "Row Major", "Column Major",
        ],
    },

    // ── Preset parameters ────────────────────────────────────────────────────

    distance: {
        type: ControlType.Number,
        title: "Distance",
        defaultValue: 40,
        min: 0,
        max: 2000,
        step: 5,
        unit: "px",
        description: "How far elements travel during directional animations.",
        hidden: function (props: any) {
            var directionalEnter = ["fadeUp", "fadeDown", "fadeLeft", "fadeRight"]
            var directionalExit = ["riseWave", "fadeDown", "fadeLeft", "fadeRight", "blurLift"]
            var enterUsesDistance = directionalEnter.indexOf(props.enterPreset) !== -1
            var exitUsesDistance = directionalExit.indexOf(props.exitPreset) !== -1
            return !enterUsesDistance && !exitUsesDistance
        },
    },
    blurAmount: {
        type: ControlType.Number,
        title: "Blur Amount",
        defaultValue: 8,
        min: 0,
        max: 50,
        step: 1,
        unit: "px",
        hidden: function (props: any) {
            return props.enterPreset !== "blurIn" && props.exitPreset !== "blurLift"
        },
    },
    scaleFrom: {
        type: ControlType.Number,
        title: "Scale From",
        defaultValue: 0.92,
        min: 0,
        max: 2,
        step: 0.01,
        hidden: function (props: any) {
            return (
                props.enterPreset !== "scaleIn" &&
                props.exitPreset !== "scaleFadeGrid" &&
                props.exitPreset !== "scaleOut"
            )
        },
    },

    // ── Advanced ─────────────────────────────────────────────────────────────

    sortPriority: {
        type: ControlType.Number,
        title: "Priority",
        defaultValue: 0,
        min: -10,
        max: 10,
        step: 1,
        description: "Controls animation order across groups. Lower numbers animate first.",
    },
    delayOffset: {
        type: ControlType.Number,
        title: "Delay Offset",
        defaultValue: 0,
        min: -1,
        max: 2,
        step: 0.01,
        unit: "s",
    },
    mobileEnabled: {
        type: ControlType.Boolean,
        title: "Mobile",
        defaultValue: true,
    },
    exitTimeout: {
        type: ControlType.Number,
        title: "Exit Timeout",
        defaultValue: 3,
        min: 0.5,
        max: 10,
        step: 0.5,
        unit: "s",
    },
    enterDelay: {
        type: ControlType.Number,
        title: "Enter Delay",
        defaultValue: 0.05,
        min: 0,
        max: 2,
        step: 0.05,
        unit: "s",
    },
})
