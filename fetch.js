if (document.getElementById("pdf-viewer") != null) {
    let src = decodeURIComponent(document.getElementById("pdf-viewer").src.split("?file=")[1]);
    chrome.runtime.sendMessage({ src: src });
} else if (document.querySelector(".course-header-container") || document.querySelector(".activity-title-wrapper")) {
    alert("請先開啟教材!");
}