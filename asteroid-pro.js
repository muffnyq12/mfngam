const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// MOBILE RESPONSIVE FIX
function resizeCanvas() {
    const DPR = window.devicePixelRatio || 1;

    canvas.width = window.innerWidth * DPR;
    canvas.height = window.innerHeight * DPR;

    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();