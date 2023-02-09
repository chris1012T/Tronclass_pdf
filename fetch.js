if (document.getElementById("pdf-viewer") != null) {
    let src = decodeURIComponent(document.getElementById("pdf-viewer").src.split("?file=")[1].split("&upload_id")[0]);
    chrome.runtime.sendMessage({ src: src });
} else if (document.querySelector(".course-header-container") || document.querySelector(".activity-title-wrapper")) {
    alert("請先開啟教材!");
}