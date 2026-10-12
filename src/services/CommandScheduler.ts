import path from "path";
import fs from "fs";
import axios from "axios";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 기본 전송 간격: 1시간
const MAX_RETRY_COUNT = 5;
const CHECK_INTERVAL_MS = 60 * 1000 * 2; // 2분
const RETRY_CHECK_INTERVAL_MS = 60 * 1000; // 60초
const CHECK_CON_URL =
  "http://kiotdpd.kweather.co.kr:30101/v1/groups/kw-vsk/CON-COM-1810001";

interface CommandEntry {
  row_index: number;
  vent_label: string;
  ac_label: string;
  vent: string;
  con: [string, string, string];
}

const CON_ROOM_NAMES = ["거실", "방1", "방2"] as const;
const CONTROL_URL = "http://kiotigrt.kweather.co.kr:20001/v1/servers";
const CHECK_COMMAND_URL =
  "http://kiotdpd.kweather.co.kr:30101/v1/groups/kw-vsk/";
const MQTT_ID = "server_kwkiotcluster-mqtt-seq";
const ventChannel = "kwv-arc/req/";
const conChannels = "con/req/CON-COM-1810001";
const VENT_SERIALS = ["KWV-ARC-1810001", "KWV-ARC-1810002", "KWV-ARC-1810003"];

export interface ConRoomResult {
  name: string;
  status: "success" | "failed";
  retryCount?: number;
  error?: string;
}

export interface CommandResult {
  commandId: number;
  sentAt: Date;
  status: "success" | "failed";
  ventRooms: ConRoomResult[]; // 인덱스 0=거실, 1=방1, 2=방2
  conRooms: ConRoomResult[];
}

export interface HistoryEvent {
  type: "started" | "round_start" | "round_end";
  sentAt: Date;
  message: string;
}

export interface SchedulerStatus {
  isRunning: boolean; // 명령 전송 중
  isWaiting: boolean; // 다음 명령 대기 중
  startIndex: number | null;
  endIndex: number | null; // 종료 번호
  totalCount: number;
  currentIndex: number | null; // 현재 실행 중인 명령 번호
  batchCount: number; // 완료된 순환 횟수
  nextCommandAt: Date | null; // 다음 명령 전송 시각
  history: (CommandResult | HistoryEvent)[];
}

class CommandScheduler {
  private isRunning = false;
  private isWaiting = false;
  private startIndex: number | null = null;
  private endIndex: number | null = null;
  private totalCount = 0;
  private currentIndex: number | null = null;
  private batchCount = 0;
  private nextCommandAt: Date | null = null;
  private timerId: NodeJS.Timeout | null = null;
  private history: (CommandResult | HistoryEvent)[] = [];
  // stop/start 시 증가 — 기존 루프는 캡처한 runId와 불일치 → 즉시 종료
  private runId = 0;
  private intervalMs = DEFAULT_INTERVAL_MS;

  private static instance: CommandScheduler;
  static getInstance(): CommandScheduler {
    if (!CommandScheduler.instance)
      CommandScheduler.instance = new CommandScheduler();
    return CommandScheduler.instance;
  }

  getStatus(): SchedulerStatus {
    return {
      isRunning: this.isRunning,
      isWaiting: this.isWaiting,
      startIndex: this.startIndex,
      endIndex: this.endIndex,
      totalCount: this.totalCount,
      currentIndex: this.currentIndex,
      batchCount: this.batchCount,
      nextCommandAt: this.nextCommandAt,
      history: this.history,
    };
  }

  private readonly COMMAND_DELAY_MS = 10000;

  // runId 불일치 시 즉시 깨어남 (0.5초마다 체크)
  private sleep(ms: number, runId: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (this.runId !== runId || Date.now() - start >= ms) {
          resolve();
        } else {
          setTimeout(tick, Math.min(500, ms - (Date.now() - start)));
        }
      };
      setTimeout(tick, Math.min(500, ms));
    });
  }

  private isStale(runId: number): boolean {
    return this.runId !== runId;
  }

  private loadCommands(): CommandEntry[] {
    const filePath = path.join(process.cwd(), "public", "json", "control.json");
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  private getCommand(rowIndex: number): CommandEntry | undefined {
    // const codes = this.loadCommands().find(
    //   (c) => c.row_index === rowIndex
    // )?.con;
    // codes?.forEach((code, i) => {
    //   const sum = [...code].reduce((a, c) => a + c.charCodeAt(0), 0) % 256;
    //   console.log(
    //     `방${i}: checkSum=${sum} (${sum
    //       .toString(16)
    //       .toUpperCase()}), 반환값="${sum
    //       .toString(16)
    //       .toUpperCase()
    //       .slice(-1)}="`
    //   );
    // });
    return this.loadCommands().find((c) => c.row_index === rowIndex);
  }

  async sendCommand(
    commandId: number,
    runId: number = this.runId
  ): Promise<CommandResult> {
    const command = this.getCommand(commandId);
    const sentAt = new Date();

    console.log(`  [명령 #${commandId}] 전송 시작`);

    if (!command) {
      const failedRooms = CON_ROOM_NAMES.map((name) => ({
        name,
        status: "failed" as const,
        error: "명령어 없음",
      }));
      return {
        commandId,
        sentAt,
        status: "failed",
        ventRooms: failedRooms,
        conRooms: failedRooms,
      };
    }

    // 환기(병렬 3개) + 에어컨(직렬 3개) 동시 진행
    const [ventRooms, conRooms] = await Promise.all([
      this.sendVentCommand(command.vent, command.vent_label, runId),
      this.sendAllConCommands(command.con, command.ac_label, runId),
    ]);

    const allSuccess =
      ventRooms.every((r) => r.status === "success") &&
      conRooms.every((r) => r.status === "success");

    return {
      commandId,
      sentAt,
      status: allSuccess ? "success" : "failed",
      ventRooms,
      conRooms,
    };
  }

  private async sendVentCommand(
    commandCode: string,
    ventLabel: string,
    runId: number
  ): Promise<ConRoomResult[]> {
    const checkSum = this.getCheckSumStr(commandCode);
    const command = commandCode + checkSum;

    const results = await Promise.all(
      VENT_SERIALS.map(async (serial, idx) => {
        const name = CON_ROOM_NAMES[idx];
        const data = {
          dataset: [
            {
              data: [{ data: command, channel: [ventChannel + serial] }],
              service: { id: MQTT_ID },
            },
          ],
        };

        // 초기 전송
        try {
          const res = await axios.post(CONTROL_URL, data, {
            headers: { "Content-Type": "application/json" },
            timeout: 5000,
          });
          if (res.data !== "Accepted")
            throw new Error(`응답 오류: ${res.data}`);
        } catch (e: any) {
          return { name, status: "failed" as const, error: e.message };
        }

        // 2분 후 첫 체크, 이후 재전송 → 60초 대기 → 체크 반복
        await this.sleep(CHECK_INTERVAL_MS, runId);
        if (this.isStale(runId))
          return { name, status: "failed" as const, error: "중단됨" };

        for (let attempt = 0; attempt <= MAX_RETRY_COUNT; attempt++) {
          if (this.isStale(runId))
            return { name, status: "failed" as const, error: "중단됨" };

          let checkResponse: any;
          try {
            checkResponse = await this.fetchCheckVentState(serial);
          } catch (e: any) {
            console.error(`    ${name} 환기 상태확인 실패: ${e.message}`);
          }

          if (this.isVentStateMatch(commandCode, ventLabel, checkResponse)) {
            return { name, status: "success" as const, retryCount: attempt };
          }

          if (attempt < MAX_RETRY_COUNT) {
            console.log(
              `    [재시도 ${
                attempt + 1
              }/${MAX_RETRY_COUNT}] ${name} 환기 재전송`
            );
            try {
              await axios.post(CONTROL_URL, data, {
                headers: { "Content-Type": "application/json" },
                timeout: 5000,
              });
            } catch (e: any) {
              console.error(`    ${name} 환기 재전송 실패: ${e.message}`);
            }
            await this.sleep(RETRY_CHECK_INTERVAL_MS, runId);
            if (this.isStale(runId))
              return { name, status: "failed" as const, error: "중단됨" };
          }
        }

        return {
          name,
          status: "failed" as const,
          retryCount: MAX_RETRY_COUNT,
          error: `${MAX_RETRY_COUNT}회 재시도 후 상태 불일치`,
        };
      })
    );

    return results;
  }

  // 에어컨: 전체 5초 간격 전송 → 2분 대기 → 거실만 상태 체크 + 재시도
  private async sendAllConCommands(
    conCodes: [string, string, string],
    acLabel: string,
    runId: number
  ): Promise<ConRoomResult[]> {
    const results: ConRoomResult[] = [];

    // 1단계: 3개 전부 5초 간격으로 순차 전송
    for (let idx = 0; idx < CON_ROOM_NAMES.length; idx++) {
      if (this.isStale(runId)) break;
      const name = CON_ROOM_NAMES[idx];
      results.push(await this.sendConCommandOnce(conCodes[idx], name));
      if (idx < CON_ROOM_NAMES.length - 1) {
        await this.sleep(this.COMMAND_DELAY_MS, runId);
      }
    }

    if (this.isStale(runId)) return results;

    // 2단계: 2분 대기
    await this.sleep(CHECK_INTERVAL_MS, runId);
    if (this.isStale(runId)) return results;

    // 3단계: 거실(idx=0)만 상태 체크 + 재시도
    if (results[0]?.status !== "failed" || !results[0].error) {
      results[0] = await this.checkAndRetryConCommand(
        conCodes[0],
        CON_ROOM_NAMES[0],
        acLabel,
        runId
      );
    }

    return results;
  }

  // 거실 전용: 상태 체크 → 불일치 시 재전송 반복
  private async checkAndRetryConCommand(
    commandCode: string,
    name: string,
    acLabel: string,
    runId: number
  ): Promise<ConRoomResult> {
    for (let attempt = 0; attempt <= MAX_RETRY_COUNT; attempt++) {
      if (this.isStale(runId))
        return { name, status: "failed", error: "중단됨" };

      let checkResponse: any;
      try {
        checkResponse = await this.fetchCheckConState();
      } catch (e: any) {
        console.error(`    ${name} 에어컨 상태확인 실패: ${e.message}`);
      }

      if (this.isConStateMatch(commandCode, checkResponse, acLabel)) {
        return { name, status: "success", retryCount: attempt };
      }

      if (attempt < MAX_RETRY_COUNT) {
        console.log(
          `    [재시도 ${attempt + 1}/${MAX_RETRY_COUNT}] ${name} 에어컨 재전송`
        );
        try {
          await this.sendRawConCommand(commandCode, name);
        } catch (e: any) {
          console.error(`    ${name} 에어컨 재전송 실패: ${e.message}`);
        }
        await this.sleep(RETRY_CHECK_INTERVAL_MS, runId);
        if (this.isStale(runId))
          return { name, status: "failed", error: "중단됨" };
      }
    }

    return {
      name,
      status: "failed",
      retryCount: MAX_RETRY_COUNT,
      error: `${MAX_RETRY_COUNT}회 재시도 후 상태 불일치`,
    };
  }

  // 방1/방2 전용: 1회만 전송
  private async sendConCommandOnce(
    commandCode: string,
    name: string
  ): Promise<ConRoomResult> {
    try {
      await this.sendRawConCommand(commandCode, name);
      return { name, status: "success" };
    } catch (e: any) {
      console.error(`    ${name} 에어컨 → 실패: ${e.message}`);
      return { name, status: "failed", error: e.message };
    }
  }

  private async sendRawConCommand(
    commandCode: string,
    name: string
  ): Promise<void> {
    const command = commandCode + this.getCheckSumStr(commandCode);
    const data = {
      dataset: [
        {
          data: [{ data: command, channel: [conChannels] }],
          service: { id: MQTT_ID },
        },
      ],
    };

    const res = await axios.post(CONTROL_URL, data, {
      headers: { "Content-Type": "application/json" },
      timeout: 5000,
    });
    if (res.data !== "Accepted") {
      throw new Error(`${name} 에어컨 응답 오류: ${res.data}`);
    }
  }

  private isVentStateMatch(
    commandCode: string,
    ventLabel: string,
    response: any
  ): boolean {
    if (!response?.data) return false;

    const mode = ventLabel.split(" ")[0];
    const wind = ventLabel.split(" ")[1]?.replace("단", "");
    const { op_mode: opMode, air_volume: airVolume, power } = response.data;

    if (mode === "Off") return power === 0;

    if (airVolume !== Number(wind)) return false;

    switch (mode) {
      case "바이패스":
        return opMode === 3;
      case "환기":
        return opMode === 1;
      case "공기청정":
        return opMode === 2;
    }

    return false;
  }

  private isConStateMatch(
    commandCode: string,
    response: any,
    acLabel: string
  ): boolean {
    if (!response?.data) return false;

    console.log("에어컨 체크 시작 ====", acLabel);

    const mode = acLabel.split(" ")[0];
    const wind = acLabel.split(" ")[1];
    const temp = acLabel.split(" ")[2]?.replace("도", "");
    const {
      power,
      set_temp: setTemp,
      air_volume: airVolume,
      op_mode: opMode,
    } = response.data;

    if (mode === "off") return power === 0;

    if (setTemp !== Number(temp)) return false;

    if (wind === "강풍" && airVolume !== 3) return false;
    if (wind === "중풍" && airVolume !== 2) return false;
    if (wind === "약풍" && airVolume !== 1) return false;

    if (mode === "난방" && opMode !== 4) return false;
    if (mode === "냉방" && opMode !== 1) return false;

    return true;
  }

  private async fetchCheckVentState(serial: string): Promise<any> {
    const res = await axios.get(CHECK_COMMAND_URL + serial, { timeout: 5000 });
    return res.data;
  }

  private async fetchCheckConState(): Promise<any> {
    const res = await axios.get(CHECK_CON_URL, { timeout: 5000 });
    return res.data;
  }

  private getCheckSumStr(controlCommand: string) {
    let asciiCode = 0;
    for (const c of controlCommand) {
      asciiCode += c.charCodeAt(0);
    }

    const checkSum = asciiCode % 256;
    const checkSumStr = checkSum.toString(16).toUpperCase();

    return checkSumStr.slice(-1) + "=";
  }

  // ── 대기 중인 모든 스케줄 작업 즉시 종료 ─────────────
  private clearSchedule(): void {
    this.runId++; // 기존 루프 전체 무효화
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  // ── 스케줄러 종료 ───────────────────────────────────
  stop(): void {
    this.clearSchedule(); // 대기 중인 스케줄 먼저 제거
    this.isRunning = false;
    this.isWaiting = false;
    this.currentIndex = null;
    this.endIndex = null;
    this.nextCommandAt = null;
    console.log("[Scheduler] ===== 전송 종료 =====");
  }

  // ── 스케줄러 시작 / 재시작 ──────────────────────────
  async start(
    startIndex: number,
    endIndex: number,
    intervalMs: number = DEFAULT_INTERVAL_MS
  ): Promise<void> {
    this.clearSchedule(); // 대기 중인 스케줄 먼저 제거 (runId 증가)
    const runId = this.runId; // 이번 실행 전용 ID 캡처

    this.intervalMs = intervalMs;
    this.totalCount = this.loadCommands().length;
    this.startIndex = startIndex;
    this.endIndex = endIndex;
    this.currentIndex = startIndex;
    this.batchCount = 0;
    this.isRunning = true; // 재시작 초기화 중에도 실행 중 상태 유지
    this.isWaiting = false;
    this.nextCommandAt = null;
    this.history = [];

    this.history.push({
      type: "started",
      sentAt: new Date(),
      message: `${startIndex}번 ~ ${endIndex}번 전송 시작`,
    });
    console.log(
      `\n[Scheduler] ===== 시작: ${startIndex}번 ~ ${endIndex}번 (간격: ${
        intervalMs / 60000
      }분) =====`
    );

    await this.runOneCommand(runId);
  }

  // 명령어 1개 전송 후 다음 명령 예약
  private async runOneCommand(runId: number): Promise<void> {
    if (this.isStale(runId)) return;

    this.isRunning = true;
    this.isWaiting = false;
    this.nextCommandAt = null;

    const idx = this.currentIndex!;
    console.log(`[Scheduler] 명령 #${idx} 전송 중...`);
    const result = await this.sendCommand(idx, runId);

    // 재시작/종료로 무효화된 경우 — isRunning과 history에 영향 주지 않음
    if (this.isStale(runId)) return;

    this.history.push(result);

    // 인덱스 전진 및 순환 처리
    if (idx >= this.endIndex!) {
      this.batchCount++;
      const roundNum = this.batchCount;
      console.log(`[Scheduler] ----- ${roundNum}회차 순환 완료 -----`);
      this.history.push({
        type: "round_end",
        sentAt: new Date(),
        message: `${roundNum}회차 순환 완료`,
      });
      this.currentIndex = this.startIndex;
      this.history.push({
        type: "round_start",
        sentAt: new Date(),
        message: `${roundNum + 1}회차 전송 시작`,
      });
    } else {
      this.currentIndex = idx + 1;
    }

    this.isRunning = false;
    this.scheduleNextCommand(runId);
  }

  private scheduleNextCommand(runId: number): void {
    if (this.isStale(runId)) return;
    this.isWaiting = true;
    this.nextCommandAt = new Date(Date.now() + this.intervalMs);

    this.timerId = setTimeout(async () => {
      this.timerId = null;
      if (this.isStale(runId)) return;
      await this.runOneCommand(runId);
    }, this.intervalMs);
  }
}

export const commandScheduler = CommandScheduler.getInstance();
