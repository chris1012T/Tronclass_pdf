// Whether an update hangs a NEW badge on the toolbar icon. When false, a NEW left over from an earlier release is removed.
const SHOW_UPDATE_BADGE = false;
// Whether the first download after an update shows the notice on the page.
const SHOW_UPDATE_POPUP = true;

function parseVersion(version) {
    if (typeof version !== "string") {
        return null;
    }
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    return match ? match.slice(1).map(Number) : null;
}

function shouldShowChangelog(previousVersion, currentVersion) {
    const previous = parseVersion(previousVersion);
    const current = parseVersion(currentVersion);
    if (!previous || !current) {
        return false;
    }
    if (current[0] !== previous[0]) {
        return current[0] > previous[0];
    }
    return current[1] > previous[1];
}

function isDownloadMessage(message, sender, extensionId) {
    if (!sender || sender.id !== extensionId) {
        return false;
    }
    if (!message || message.type !== "download") {
        return false;
    }
    if (typeof message.filename !== "string" || message.filename === "") {
        return false;
    }
    if (typeof message.url !== "string") {
        return false;
    }
    try {
        const protocol = new URL(message.url).protocol;
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
}

// Serialized by executeScript, so it must not reference anything outside its own body.
// The caller passes both texts already translated, which keeps this function free of chrome.* calls.
function showWhatsNew(message, closeLabel) {
    const previous = document.getElementById("tronclass-pdf-whats-new");
    if (previous) {
        previous.remove();
    }
    if (!document.body) {
        return;
    }
    // Styles go through CSSOM properties, which the page CSP style-src does not block.
    // The box is a fixed frame at the final position that clips everything above its top edge; the card slides inside it.
    const box = document.createElement("div");
    box.id = "tronclass-pdf-whats-new";
    box.setAttribute("role", "status");
    box.style.position = "fixed";
    // Top center. left: 50% alone makes the width shrink-to-fit, so max-content plus a viewport-aware maxWidth keep it readable.
    box.style.top = "16px";
    box.style.left = "50%";
    box.style.transform = "translateX(-50%)";
    box.style.zIndex = "2147483647";
    box.style.width = "max-content";
    // The card is 360px of content plus 32px of padding and border, and 100vw - 32px leaves 16px on each side.
    box.style.maxWidth = "min(392px, calc(100vw - 32px))";
    // Hide whatever is above the top edge, but let the shadow show on the other three sides.
    box.style.clipPath = "inset(0 -40px -40px -40px)";

    const card = document.createElement("div");
    card.style.display = "flex";
    card.style.alignItems = "center";
    card.style.gap = "12px";
    card.style.width = "max-content";
    // Content-box: 360px plus 32px of padding and border is 392px on desktop; 100vw - 64px leaves 16px on each side.
    card.style.maxWidth = "min(360px, calc(100vw - 64px))";
    card.style.padding = "12px 14px";
    card.style.background = "#ffffff";
    card.style.color = "#1f2328";
    card.style.borderRadius = "8px";
    card.style.borderLeft = "4px solid #1aa99b";
    card.style.boxShadow = "0 6px 20px rgba(0, 0, 0, 0.18)";
    card.style.fontFamily = "system-ui, \"Segoe UI\", \"Noto Sans TC\", \"Microsoft JhengHei\", sans-serif";
    card.style.fontSize = "14px";
    card.style.lineHeight = "1.5";

    const text = document.createElement("span");
    text.textContent = message;

    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", closeLabel);
    close.textContent = "\u00d7";
    close.style.border = "none";
    close.style.background = "transparent";
    close.style.color = "#57606a";
    close.style.cursor = "pointer";
    close.style.fontSize = "18px";
    close.style.lineHeight = "1";
    close.style.padding = "0 4px";

    card.appendChild(text);
    card.appendChild(close);
    box.appendChild(card);

    // Damped spring sampled into CSS linear(): zeta 0.8 and response 0.5 s overshoot by about 1.5%.
    function spring(zeta, response, ms) {
        const w = (2 * Math.PI) / response;
        const wd = w * Math.sqrt(1 - zeta * zeta);
        const points = [];
        for (let i = 0; i <= 40; i++) {
            const t = (i / 40) * (ms / 1000);
            const x = 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
            points.push(i === 40 ? 1 : Math.round(x * 10000) / 10000);
        }
        return "linear(" + points.join(", ") + ")";
    }
    const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const supportsLinear = typeof CSS !== "undefined" && typeof CSS.supports === "function"
        && CSS.supports("animation-timing-function", "linear(0, 1)");
    // 28px beyond the card height clears the shadow, which reaches 26px below the card.
    const HIDDEN = "translateY(calc(-100% - 28px))";
    let animated = typeof card.animate === "function";
    let entering = null;
    let leaving = false;

    // Closing and the timer both end here, and a box only leaves once.
    function leave() {
        if (leaving) {
            return;
        }
        leaving = true;
        const remove = () => box.remove();
        if (!animated) {
            remove();
            return;
        }
        try {
            // Start from where the card is now, so closing during the entrance does not jump back to the top.
            const inFlight = entering !== null && entering.playState !== "finished";
            const current = inFlight ? getComputedStyle(card) : null;
            const from = reduceMotion
                ? (current && current.opacity) || "1"
                : (current && current.transform && current.transform !== "none" && current.transform) || "translateY(0)";
            if (inFlight) {
                entering.cancel();
            }
            const keyframes = reduceMotion
                ? [{ opacity: from }, { opacity: 0 }]
                : [{ transform: from }, { transform: HIDDEN }];
            const easing = reduceMotion ? "ease-out" : "cubic-bezier(0.32, 0, 0.67, 0)";
            const options = { duration: reduceMotion ? 150 : 300, easing, fill: "forwards" };
            // Remove this exact box, and also when the animation is cancelled.
            card.animate(keyframes, options).finished.then(remove, remove);
        } catch (error) {
            remove();
        }
    }
    close.addEventListener("click", leave);

    document.body.appendChild(box);
    if (animated) {
        // Same task as the append, so the first painted frame is already the start of the entrance.
        try {
            const keyframes = reduceMotion
                ? [{ opacity: 0 }, { opacity: 1 }]
                : [{ transform: HIDDEN }, { transform: "translateY(0)" }];
            const easing = reduceMotion ? "ease-out" : supportsLinear ? spring(0.8, 0.5, 550) : "cubic-bezier(0.32, 0.72, 0, 1)";
            entering = card.animate(keyframes, { duration: reduceMotion ? 150 : 550, easing });
        } catch (error) {
            animated = false;
        }
    }
    // Leave through this exact box so an older timer cannot remove a newer notice.
    setTimeout(leave, 8000);
}

if (typeof module !== "undefined") {
    module.exports = {
        shouldShowChangelog,
        isDownloadMessage,
        showWhatsNew
    };
}
