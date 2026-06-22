// chart.js — simple canvas chart helpers
function drawBarChart(canvas, labels, data, color = '#58a6ff') {
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.parentElement.offsetWidth;
    const h = canvas.height = 200;
    ctx.clearRect(0, 0, w, h);

    const max = Math.max(...data, 1);
    const barW = Math.floor((w - 40) / data.length) - 4;
    const startX = 30;

    ctx.strokeStyle = '#30363d';
    ctx.beginPath();
    ctx.moveTo(startX, h - 30);
    ctx.lineTo(w, h - 30);
    ctx.stroke();

    data.forEach((val, i) => {
        const x = startX + i * (barW + 4);
        const barH = (val / max) * (h - 50);
        ctx.fillStyle = color;
        ctx.fillRect(x, h - 30 - barH, barW, barH);

        ctx.fillStyle = '#8b949e';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        if (labels[i]) ctx.fillText(labels[i], x + barW / 2, h - 12);
        if (val > 0) ctx.fillText(val, x + barW / 2, h - 34 - barH);
    });
}
