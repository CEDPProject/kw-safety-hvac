import { AppDataSource } from "../config/database";
import express from "express";
import path from "path";
import http from "http";
import cors from "cors";
import "reflect-metadata";
import session from "express-session";

// router import
import { infoRouter } from "./routes/api/info";
import { infoaiRouter } from "./routes/api/infoai";
import { controlRouter } from "./routes/api/control";

//DB 설정 및 init , await 사용을 위해 익명함수 사용
(async () => {
  const initMysql = async () => {
    await AppDataSource.initialize();
    console.log("\x1b[34m%s\x1b[0m", "=>   Mysql connected!");
  };

  try {
    await initMysql(); // <--- Database connection initialized
  } catch (error) {
    console.log(error);
  }
})();

const app = express();
const sessionTimeout = 1000 * 60 * 120;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

// express-session 설정
app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: sessionTimeout },
  })
);

// // 모든 출처 허용 옵션. true 를 써도 된다.
app.use(cors(), function (req, res, next) {
  if (
    req.url == "/private/inner_private" ||
    req.url == "/private/inner_service"
  ) {
    if (req.header("api-key") == "kweather") {
      next();
    } else {
      res.render("external_access_error.ejs");
    }
  } else {
    next();
  }
});

// body parser를 라우트 마운트 전으로 이동 (POST body 파싱)
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/info", infoRouter);
app.use("/control", controlRouter);
app.use("/infoai", infoaiRouter);

app.get("/", (_req, res) => res.redirect("/info"));

app.use("/", express.static(path.join(PUBLIC_DIR, "css")));
app.use("/", express.static(path.join(PUBLIC_DIR, "js")));
app.use("/", express.static(path.join(PUBLIC_DIR, "images")));
app.use("/", express.static(path.join(PUBLIC_DIR, "json")));

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

const port = process.env.SERVER_PORT;
app.set("port", port);
var server = http.createServer(app);
server.listen(port);

export { server };
