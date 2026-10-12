// 시계
function updateClock() {
  const el = document.getElementById("time");
  if (el) el.textContent = dayjs().format("YYYY-MM-DD HH:mm:ss");
}
setInterval(updateClock, 1000);
updateClock();

/* ── 테이블 상태: 대기 / 진행 / 성공 / 실패 ─── */
function statusText(st) {
  const map = {
    waiting: `<span class="st-waiting"><i class="bi bi-clock"></i> 대기</span>`,
    sending: `<span class="st-sending"><span class="spinner"></span> 진행</span>`,
    sent: `<span class="st-sent"><i class="bi bi-check-circle-fill"></i> 성공</span>`,
    failed: `<span class="st-failed"><i class="bi bi-x-circle-fill"></i> 실패</span>`,
  };
  return map[st] || map.waiting;
}

/* ── 명령어 테이블 초기 렌더 ─────────────────── */
async function loadCommandList() {
  const res = await fetch("/control/commands");
  if (!res.ok) return;
  const commands = await res.json();
  window._totalCount = commands.length;

  const tbody = document.getElementById("commandBody");
  tbody.innerHTML = commands
    .map(
      (cmd) => `
    <tr id="row-${cmd.row_index}">
      <td class="num-cell">${cmd.row_index}</td>
      <td class="label-cell">${cmd.vent_label || "-"}</td>
      <td class="label-cell">${cmd.ac_label || "-"}</td>
      <td id="status-${cmd.row_index}" class="status-cell">${statusText(
        "waiting"
      )}</td>
    </tr>`
    )
    .join("");
}

/* ── 카운트다운 ──────────────────────────────── */
function countdown(target) {
  if (!target) return "--:--:--";
  const diff = Math.max(0, new Date(target) - Date.now());
  const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/* ── UI 전체 반영 ────────────────────────────── */
function applyStatus(status) {
  const btnStart = document.getElementById("btnStart");
  const statusCard = document.getElementById("statusCard");
  const statusBadge = document.getElementById("statusBadge");
  const statusLabel = document.getElementById("statusLabel");
  const statusProg = document.getElementById("statusProgress");
  const statusCd = document.getElementById("statusCountdown");
  const progressBar = document.getElementById("progressBar");

  const total = status.totalCount || window._totalCount || 0;
  const endIdx = status.endIndex ?? total;
  const span = status.startIndex ? endIdx - status.startIndex + 1 : total;

  const btnStop = document.getElementById("btnStop");

  if (status.isRunning) {
    statusCard.style.display = "";
    btnStart.classList.add("is-running");
    btnStart.innerHTML = `<i class="bi bi-arrow-repeat"></i> 전송 재시작`;
    btnStop.style.display = "";

    statusBadge.className = "ctrl-badge badge-running";
    statusBadge.innerHTML = `<i class="bi bi-circle-fill blink"></i> ${
      status.batchCount + 1
    }회차 전송 중`;
    statusLabel.textContent = `${status.batchCount + 1}회차 전송 중`;

    const done =
      status.currentIndex != null ? status.currentIndex - status.startIndex : 0;
    const pct = span > 0 ? Math.max(0, Math.round((done / span) * 100)) : 0;
    statusProg.textContent = `${done} / ${span}`;
    progressBar.style.width = pct + "%";
    statusCd.textContent = `명령 #${status.currentIndex} 전송 중`;
    stopCountdown();
  } else if (status.isWaiting) {
    statusCard.style.display = "";
    btnStart.classList.add("is-running");
    btnStart.innerHTML = `<i class="bi bi-arrow-repeat"></i> 전송 재시작`;
    btnStop.style.display = "";

    statusBadge.className = "ctrl-badge badge-waiting";
    statusBadge.innerHTML = `<i class="bi bi-hourglass-split"></i> ${status.batchCount}회차 완료 · 다음 명령 대기`;
    statusLabel.textContent = `${status.batchCount}회차 완료`;
    const waitDone =
      status.currentIndex != null
        ? status.currentIndex - status.startIndex
        : span;
    const waitPct =
      span > 0 ? Math.min(100, Math.round((waitDone / span) * 100)) : 0;
    statusProg.textContent = `${waitDone} / ${span}`;
    progressBar.style.width = waitPct + "%";

    // 카운트다운 1초 갱신을 위해 값 저장 후 타이머 시작
    _nextCommandAt = status.nextCommandAt;
    _nextCommandIdx = status.currentIndex;
    statusCd.textContent = `다음 명령 #${status.currentIndex}: ${countdown(
      status.nextCommandAt
    )}`;
    startCountdown();
  } else {
    statusCard.style.display = "none";
    btnStart.classList.remove("is-running");
    btnStart.innerHTML = `<i class="bi bi-play-fill"></i> 전송 시작`;
    btnStop.style.display = "none";
    stopCountdown();
  }

  /* ── 테이블 행 상태 (대기 / 진행 / 성공 / 실패) ── */
  if (status.startIndex != null) {
    // 현재 사이클 기준으로만 상태 반영 (마지막 started/round_start 이후)
    const histArr = status.history || [];
    const lastRoundIdx = histArr.reduce(
      (acc, e, i) =>
        e.type === "round_start" || e.type === "started" ? i : acc,
      0
    );
    const sentMap = new Map(
      histArr
        .slice(lastRoundIdx)
        .filter((e) => !e.type)
        .map((e) => [e.commandId, e.status])
    );

    for (let i = 1; i <= total; i++) {
      const row = document.getElementById(`row-${i}`);
      const stCell = document.getElementById(`status-${i}`);
      if (!row || !stCell) continue;

      row.className = "";

      if (i === status.currentIndex && status.isRunning) {
        // 현재 전송 중
        row.classList.add("row-sending");
        stCell.innerHTML = statusText("sending");
      } else if (sentMap.has(i)) {
        // 이미 전송 완료 — history 결과 반영
        const success = sentMap.get(i) === "success";
        row.classList.add(success ? "row-sent" : "row-failed");
        stCell.innerHTML = statusText(success ? "sent" : "failed");
      } else {
        // 아직 전송 전
        row.classList.add("row-waiting");
        stCell.innerHTML = statusText("waiting");
      }
    }

    // 현재 전송 중인 행으로 스크롤
    if (status.isRunning && status.currentIndex) {
      const cur = document.getElementById(`row-${status.currentIndex}`);
      if (cur) cur.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  /* ── 히스토리 ── */
  const historyList = document.getElementById("historyList");
  const historyCount = document.getElementById("historyCount");
  const entries = status.history || [];
  historyCount.textContent = `${entries.filter((e) => !e.type).length}건`;

  if (entries.length === 0) {
    historyList.innerHTML = `<div class="ctrl-history-empty">아직 전송 기록이 없습니다</div>`;
    return;
  }

  const iconMap = {
    started: "play-circle-fill",
    round_start: "arrow-repeat",
    round_end: "check2-all",
  };

  historyList.innerHTML = [...entries]
    .reverse()
    .map((e) => {
      const time = dayjs(e.sentAt).format("HH:mm:ss");

      // 이벤트 (시작/회차 시작·완료)
      if (e.type) {
        return `<div class="ctrl-history-item">
        <span class="h-time">${time}</span>
        <span class="h-cmd">-</span>
        <div class="h-info">
          <span class="h-status s-started">
            <i class="bi bi-${iconMap[e.type] || "info-circle"}"></i> ${
          e.message
        }
          </span>
        </div>
      </div>`;
      }

      // 명령 결과
      const sc = e.status === "success" ? "s-success" : "s-failed";
      const txt = e.status === "success" ? "성공" : "실패";
      const ic = e.status === "success" ? "check-circle-fill" : "x-circle-fill";
      // 방별로 환기(공통) + 에어컨(방별) 표시
      const roomTxt = (e.conRooms || [])
        .map((r, idx) => {
          const v = e.ventRooms?.[idx]?.status === "success" ? "✓" : "✗";
          const a = r.status === "success" ? "✓" : "✗";
          return `${r.name}: 환기 ${v} 에어컨 ${a}`;
        })
        .join(" | ");

      return `<div class="ctrl-history-item">
      <span class="h-time">${time}</span>
      <span class="h-cmd">#${e.commandId}</span>
      <div class="h-info">
        <span class="h-status ${sc}"><i class="bi bi-${ic}"></i> ${txt}</span>
        <span class="h-rooms">${roomTxt}</span>
      </div>
    </div>`;
    })
    .join("");
}

/* ── 카운트다운 1초 갱신 ─────────────────────── */
let _nextCommandAt = null; // 마지막으로 받은 nextCommandAt 값 보관
let _nextCommandIdx = null; // 다음 명령 번호
let cdTimer = null;

function startCountdown() {
  if (cdTimer) return;
  cdTimer = setInterval(() => {
    if (!_nextCommandAt) return;
    const statusCd = document.getElementById("statusCountdown");
    if (statusCd) {
      statusCd.textContent = `다음 명령 #${_nextCommandIdx}: ${countdown(
        _nextCommandAt
      )}`;
    }
  }, 1000);
}

function stopCountdown() {
  if (cdTimer) {
    clearInterval(cdTimer);
    cdTimer = null;
  }
}

/* ── 폴링 ────────────────────────────────────── */
let pollTimer = null;
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    const res = await fetch("/control/status");
    if (!res.ok) return;
    applyStatus(await res.json());
  }, 3000);
}

async function fetchInitialStatus() {
  const res = await fetch("/control/status");
  if (!res.ok) return;
  const status = await res.json();
  applyStatus(status);
  if (status.isRunning || status.isWaiting) startPolling();
}

/* ── 전송 시작 ───────────────────────────────── */
async function startAutoSend() {
  const startIndex = parseInt(document.getElementById("startIndex").value);
  const endIndex = parseInt(document.getElementById("endIndex").value);
  const intervalMinutes = parseInt(
    document.getElementById("intervalMinutes").value
  );

  if (endIndex < startIndex) {
    alert("종료 번호는 시작 번호 이상이어야 합니다.");
    return;
  }

  // 입력값 검증: 10~240분, 10분 단위
  if (isNaN(intervalMinutes) || intervalMinutes < 10 || intervalMinutes > 240) {
    alert("전송 간격은 10분 ~ 240분(4시간) 사이여야 합니다.");
    return;
  }
  if (intervalMinutes % 10 !== 0) {
    alert("전송 간격은 10분 단위로 입력해주세요.");
    return;
  }

  const btn = document.getElementById("btnStart");
  btn.disabled = true;
  try {
    const res = await fetch("/control/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startIndex, endIndex, intervalMinutes }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(`오류: ${err.message || "전송 시작 실패"}`);
      return;
    }
    applyStatus(await res.json());
    startPolling();
  } catch {
    alert("서버 연결 오류");
  } finally {
    btn.disabled = false;
  }
}

/* ── 전송 종료 ───────────────────────────────── */
async function stopAutoSend() {
  const btn = document.getElementById("btnStop");
  btn.disabled = true;
  try {
    const res = await fetch("/control/stop", { method: "POST" });
    if (!res.ok) return;
    const status = await res.json();
    applyStatus(status);
    // 폴링 및 카운트다운 타이머 중지
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    stopCountdown();
    // 테이블 행 상태 초기화
    const total = status.totalCount || window._totalCount || 0;
    for (let i = 1; i <= total; i++) {
      const row = document.getElementById(`row-${i}`);
      const stCell = document.getElementById(`status-${i}`);
      if (!row || !stCell) continue;
      row.className = "";
      row.classList.add("row-waiting");
      stCell.innerHTML = statusText("waiting");
    }
  } finally {
    btn.disabled = false;
  }
}

/* ── 초기화 ──────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  await loadCommandList();
  await fetchInitialStatus();
  document.getElementById("btnStart").addEventListener("click", startAutoSend);
  document.getElementById("btnStop").addEventListener("click", stopAutoSend);

  // 시작 번호 변경 시 종료 번호가 시작 번호 미만이면 자동 조정
  document.getElementById("startIndex").addEventListener("change", () => {
    const start = parseInt(document.getElementById("startIndex").value);
    const endSel = document.getElementById("endIndex");
    if (parseInt(endSel.value) < start) endSel.value = String(start);
  });
});
