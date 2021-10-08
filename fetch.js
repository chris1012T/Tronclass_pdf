if (document.getElementById("pdf-viewer") != null) {
    var src = document.getElementById("pdf-viewer").src;
    var srcarr = src.split("?file=");
    src = decodeURIComponent(srcarr[1]);
    chrome.runtime.sendMessage({ src: src });
} else if (document.querySelector(".course-header-container") || document.querySelector(".activity-title-wrapper")) {
    alert("請先開啟教材!");
}