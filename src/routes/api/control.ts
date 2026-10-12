import { Request, Response, NextFunction, Router } from "express";
import path from "path";
import fs from "fs";
import { commandScheduler } from "../../services/CommandScheduler";

const controlRouter = Router();

// 명령어 JSON 로드 (public/json/control.json)
function loadCommands(): any[] {
  const filePath = path.join(process.cwd(), "public", "json", "control.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// 페이지 렌더링 — totalCount를 EJS에 전달
controlRouter.get(
  "/",
  async function (_req: Request, res: Response, _next: NextFunction) {
    const totalCount = loadCommands().length;
    res.render("control", { totalCount });
  }
);

// 명령어 리스트 반환
controlRouter.get(
  "/commands",
  async function (_req: Request, res: Response, _next: NextFunction) {
    const commands = loadCommands();
    res.json(commands);
  }
);

// 스케줄러 상태 반환 (폴링용)
controlRouter.get(
  "/status",
  async function (_req: Request, res: Response, _next: NextFunction) {
    res.json(commandScheduler.getStatus());
  }
);

// 자동 전송 시작 (재시작 포함)
controlRouter.post(
  "/start",
  async function (req: Request, res: Response, _next: NextFunction) {
    const { startIndex, endIndex, intervalMinutes } = req.body;
    const total = loadCommands().length;
    if (!startIndex || startIndex < 1 || startIndex > total) {
      return res.status(400).json({ message: `시작 번호는 1~${total} 사이여야 합니다.` });
    }

    const end = endIndex ?? total;
    if (end < 1 || end > total || end < startIndex) {
      return res.status(400).json({ message: `종료 번호는 ${startIndex}~${total} 사이여야 합니다.` });
    }

    const interval = parseInt(intervalMinutes);
    if (isNaN(interval) || interval < 10 || interval > 240 || interval % 10 !== 0) {
      return res.status(400).json({ message: "전송 간격은 10~240분 사이의 10분 단위여야 합니다." });
    }
    const intervalMs = interval * 60 * 1000;

    // 실행은 백그라운드에서 — await 하지 않아야 isRunning 상태를 폴링으로 관찰 가능
    commandScheduler.start(startIndex, end, intervalMs).catch((err: any) => {
      console.error("[Control] 스케줄러 시작 실패:", err);
    });

    // 스케줄러가 isRunning = true로 전환될 시간을 잠깐 대기 후 응답
    await new Promise((r) => setTimeout(r, 80));
    res.json(commandScheduler.getStatus());
  }
);

// 전송 종료
controlRouter.post(
  "/stop",
  async function (_req: Request, res: Response, _next: NextFunction) {
    commandScheduler.stop();
    res.json(commandScheduler.getStatus());
  }
);

// 단일 명령어 수동 전송 (테스트용)
controlRouter.post(
  "/send/:id",
  async function (req: Request, res: Response, _next: NextFunction) {
    const id = parseInt(req.params.id);
    const total = loadCommands().length;
    if (isNaN(id) || id < 1 || id > total) {
      return res.status(400).json({ message: `명령어 ID는 1~${total} 사이여야 합니다.` });
    }

    try {
      const result = await commandScheduler.sendCommand(id);
      res.json(result);
    } catch (err: any) {
      console.error("[Control] 명령어 전송 실패:", err);
      res.status(500).json({ message: err.message || "명령어 전송 실패" });
    }
  }
);

export { controlRouter };
