// 시계
function updateClock() {
  const el = document.getElementById("time");
  if (el) el.textContent = dayjs().format("YYYY-MM-DD HH:mm:ss");
}
setInterval(updateClock, 1000);
updateClock();
