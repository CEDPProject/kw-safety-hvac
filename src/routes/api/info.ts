import { Request, Response, NextFunction, Router, response } from "express";
import { StationService } from "../../services/StationService";
import axios from "axios";
import moment from "moment";

const infoRouter = Router();
const baseUrl = "https://datacenter.kweather.co.kr/api/collection/v2/history";

interface SensorData {
  dataTime?: string;
  pm10?: number;
  pm25?: number;
  co2?: number;
  voc?: number;
  temp?: number;
  humi?: number;
  outdoorPm10?: number;
  outdoorPm25?: number;
  outdoorTemp?: number;
  outdoorHumi?: number;
  ventPower?: number;
  ventAirvolume?: number;
  ventMode?: number;
  ventWatt?: number;
  ventWattHour?: number;
  conPower?: number;
  conMode?: number;
  conAirvolume?: number;
  conSetTemp?: number;
  conTemp?: number;
  conWatt?: number;
  conWattHour?: number;
}
const getDeviceList = async (memberIdx: number) => {
  const stationService = new StationService();
  const [deviceList] = await stationService.getDeviceIdxList(memberIdx);
  return deviceList;
};

infoRouter.get(
  "/",
  async function (req: Request, res: Response, next: NextFunction) {
    const start = parseInt(req.query.start as string); // 페이지의 시작 인덱스
    const length = parseInt(req.query.length as string);

    //사용자 인덱스 USER_ID : iitp-livinglab
    //사용자 장비 리스트 조회

    const deviceList = await getDeviceList(14430);

    if (!deviceList || deviceList.length === 0) {
      return res.status(404).send("No devices found for the user.");
    }

    const iaqList = deviceList.filter((d) => d.device_model.startsWith("IAQ"));
    const oaqList = deviceList.filter((d) => d.device_model.startsWith("OAQ"));

    if (iaqList.length === 0) {
      return res.status(404).send("No IAQ devices found.");
    }

    const startTime = moment().format("YYYY/MM/DD") + "-00:00:00";
    const endTime = moment().format("YYYY/MM/DD") + "-23:59:59";

    const dataMap = await getHistoryData(
      startTime,
      endTime,
      iaqList[0].serial_num,
      oaqList[0].serial_num,
      iaqList[0].idx
    );

    //console.log(iaqData2);

    //장비별 과거 데이터 조회
    //측정장비, 환기,냉난방 장비 합치기
    const iaqData2Array = Array.from(dataMap.entries()).sort((a, b) => {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });

    // 페이지네이션 처리
    //const pageData = iaqData2Array.slice(start, start + length);

    res.render("info", { iaqList, iaqData2: JSON.stringify(iaqData2Array) });
  }
);

infoRouter.get(
  "/chartData",
  async function (req: Request, res: Response, next: NextFunction) {
    const dateStr = req.query.dateStr as string;
    const startTime = dateStr + "-00:00:00";
    const endTime = dateStr + "-23:59:59";
    const iaqserial = req.query.iaqserial as string;
    const deviceList = await getDeviceList(14430);

    const iaqList = deviceList.filter((d) => d.serial_num === iaqserial);
    const oaqList = deviceList.filter((d) => d.device_model.startsWith("OAQ"));

    const dataMap = await getHistoryData(
      startTime,
      endTime,
      iaqserial,
      oaqList[0].serial_num,
      iaqList[0].idx
    );

    //장비별 과거 데이터 조회
    //측정장비, 환기,냉난방 장비 합치기
    const dataArray = Array.from(dataMap.entries()).sort((a, b) => {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });

    res.json(dataArray);
  }
);

infoRouter.get(
  "/tableData",
  async function (req: Request, res: Response, next: NextFunction) {
    const iaqserial = req.query.iaqserial as string;
    const startDtStr = req.query.startDt as string;
    const endDtStr = req.query.endDt as string;

    const deviceList = await getDeviceList(14430);
    const iaqList = deviceList.filter((d) => d.serial_num === iaqserial);
    const oaqList = deviceList.filter((d) => d.device_model.startsWith("OAQ"));

    // K-Weather API는 단일 날짜 범위(standard=sum)만 정상 지원
    // → 날짜 범위를 하루씩 순회하며 각각 조회 후 병합
    const resultMap: Map<string, SensorData> = new Map();
    const current = moment(startDtStr, "YYYY/MM/DD");
    const endDate = moment(endDtStr, "YYYY/MM/DD");

    while (current.isSameOrBefore(endDate, "day")) {
      const dateStr = current.format("YYYY/MM/DD");
      const dayData = await getHistoryData(
        dateStr + "-00:00:00",
        dateStr + "-23:59:59",
        iaqserial,
        oaqList[0].serial_num,
        iaqList[0].idx
      );
      dayData.forEach((value, key) => resultMap.set(key, value));
      current.add(1, "day");
    }

    const dataArray = Array.from(resultMap.entries()).sort((a, b) => {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });

    res.json(dataArray);
  }
);

// 과거 데이터 조회
async function getHistoryData(
  startTime: string, // 시작 시간
  endTime: string, // 종료 시간
  iaqserial: string, // IAQ 시리얼 번호
  oaqserial: string, // OAQ 시리얼 번호
  iaqIdx: number // IAQ 인덱스
) {
  const dataMap: Map<string, SensorData> = new Map();
  const stationService = new StationService();

  // ventList는 DB 조회이므로 먼저 실행
  const ventList = await stationService.getVentDeviceIdxList(iaqIdx);

  // 4개 K-Weather API 병렬 호출 (순차→병렬로 응답 속도 개선)
  const [iaqData, oaqData, ventData, conData] = await Promise.all([
    axios
      .get(`${baseUrl}?deviceType=iaq&serial=${iaqserial}&startTime=${startTime}&endTime=${endTime}&standard=sum&connect=0`, { timeout: 10000 })
      .then((res) => res.data.data)
      .catch((err) => { console.error('[IAQ API 오류]', err.message); return []; }),
    axios
      .get(`${baseUrl}?deviceType=oaq&serial=${oaqserial}&startTime=${startTime}&endTime=${endTime}&standard=sum&connect=0`, { timeout: 10000 })
      .then((res) => res.data.data)
      .catch((err) => { console.error('[OAQ API 오류]', err.message); return []; }),
    axios
      .get(`${baseUrl}?deviceType=vent&serial=${ventList[0].serial_num}&startTime=${startTime}&endTime=${endTime}&standard=sum&connect=0`, { timeout: 10000 })
      .then((res) => res.data.data)
      .catch((err) => { console.error('[VENT API 오류]', err.message); return []; }),
    axios
      .get(`${baseUrl}?deviceType=vent&serial=${ventList[1].serial_num}&startTime=${startTime}&endTime=${endTime}&standard=sum&connect=0`, { timeout: 10000 })
      .then((res) => res.data.data)
      .catch((err) => { console.error('[CON API 오류]', err.message); return []; }),
  ]);

  iaqData.forEach((d) => {
    const sensor: SensorData = {
      dataTime: d.dataTime,
      pm10: d.pm10 || "-",
      pm25: d.pm25 || "-",
      co2: d.co2 || "-",
      voc: d.voc || "-",
      temp: d.temp || "-",
      humi: d.humi || "-",
    };

    const existingData = dataMap.get(d.dataTime) ?? {};

    dataMap.set(d.dataTime, { ...existingData, ...sensor });
  });

  oaqData.forEach((d) => {
    const sensor: SensorData = {
      dataTime: d.dataTime,
      outdoorPm10: d.pm10 || "-",
      outdoorPm25: d.pm25 || "-",
      outdoorTemp: d.temp || "-",
      outdoorHumi: d.humi || "-",
    };
    const existingData = dataMap.get(d.dataTime) ?? {};
    dataMap.set(d.dataTime, { ...existingData, ...sensor });
  });

  ventData.forEach((d) => {
    const sensor: SensorData = {
      dataTime: d.dataTime,
      ventPower: d.power || "-",
      ventAirvolume: d.air_volume || "-",
      ventMode: d.op_mode || "-",
      ventWatt: d.watt || "-",
      ventWattHour: d.watt_hour || "-",
    };
    const existingData = dataMap.get(d.dataTime) ?? {};
    dataMap.set(d.dataTime, { ...existingData, ...sensor });
  });

  conData.forEach((d) => {
    const sensor: SensorData = {
      dataTime: d.dataTime,
      conPower: d.power || "-",
      conMode: d.op_mode || "-",
      conAirvolume: d.air_volume || "-",
      conSetTemp: d.set_temp || "-",
      conTemp: d.con_temp || "-",
      conWatt: d.watt || "-",
      conWattHour: d.watt_hour || "-",
    };
    const existingData = dataMap.get(d.dataTime) ?? {};
    dataMap.set(d.dataTime, { ...existingData, ...sensor });
  });

  return dataMap;
}

infoRouter.get(
  "/downloadCsv",
  async function (req: Request, res: Response, next: NextFunction) {
    const iaqserial = req.query.iaqserial as string;
    const startDtStr = req.query.startDt as string;
    const endDtStr = req.query.endDt as string;

    if (!iaqserial || !startDtStr || !endDtStr) {
      return res.status(400).send("필수 파라미터가 누락되었습니다.");
    }

    const startMoment = moment(startDtStr, "YYYY/MM/DD", true);
    const endMoment = moment(endDtStr, "YYYY/MM/DD", true);

    if (!startMoment.isValid() || !endMoment.isValid()) {
      return res.status(400).send("날짜 형식이 올바르지 않습니다.");
    }
    if (endMoment.isBefore(startMoment)) {
      return res.status(400).send("종료일이 시작일보다 앞설 수 없습니다.");
    }
    if (endMoment.diff(startMoment, "days") > 90) {
      return res.status(400).send("최대 90일까지 다운로드 가능합니다.");
    }

    const deviceList = await getDeviceList(14430);
    const iaqList = deviceList.filter((d) => d.serial_num === iaqserial);
    const oaqList = deviceList.filter((d) => d.device_model.startsWith("OAQ"));

    if (!iaqList.length || !oaqList.length) {
      return res.status(404).send("장치 정보를 찾을 수 없습니다.");
    }

    const filenameDateRange = `${startDtStr.replace(/\//g, "")}_${endDtStr.replace(/\//g, "")}`;
    const filename = encodeURIComponent(`안전공조시스템_데이터_${filenameDateRange}.csv`);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
    res.write("﻿"); // UTF-8 BOM (Excel 한글 호환)
    res.write(
      "데이터 시간,실내미세먼지(㎍/㎥),실내초미세먼지(㎍/㎥),실내이산화탄소(ppm),실내휘발성유기화합물(ppb),실내온도(℃),실내습도(%)," +
      "실외미세먼지(㎍/㎥),실외초미세먼지(㎍/㎥),실외온도(℃),실외습도(%)," +
      "환기전원,환기풍량,환기운전모드,환기누적전력량(Wh),환기유효전력(W)," +
      "냉난방전원,냉난방운전모드,냉난방풍량,냉난방설정온도(℃),냉난방누적전력량(Wh),냉난방유효전력(W)\r\n"
    );

    try {
      const current = startMoment.clone();
      while (current.isSameOrBefore(endMoment, "day")) {
        const dateStr = current.format("YYYY/MM/DD");
        const dayData = await getHistoryData(
          dateStr + "-00:00:00",
          dateStr + "-23:59:59",
          iaqserial,
          oaqList[0].serial_num,
          iaqList[0].idx
        );

        const sorted = Array.from(dayData.entries()).sort(
          (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
        );

        for (const [, v] of sorted) {
          const row = [
            v.dataTime ?? "",
            extractVal(v.pm10), extractVal(v.pm25), extractVal(v.co2), extractVal(v.voc),
            extractVal(v.temp), extractVal(v.humi),
            extractVal(v.outdoorPm10), extractVal(v.outdoorPm25),
            extractVal(v.outdoorTemp), extractVal(v.outdoorHumi),
            extractVal(v.ventPower), extractVal(v.ventAirvolume),
            extractVal(v.ventMode), extractVal(v.ventWattHour), extractVal(v.ventWatt),
            extractVal(v.conPower), extractVal(v.conMode), extractVal(v.conAirvolume),
            extractVal(v.conSetTemp), extractVal(v.conWattHour), extractVal(v.conWatt),
          ].join(",");
          res.write(row + "\r\n");
        }

        current.add(1, "day");
      }
      res.end();
    } catch (err) {
      console.error("[downloadCsv 오류]", err);
      if (!res.headersSent) {
        res.status(500).send("CSV 다운로드 중 서버 오류가 발생했습니다.");
      } else {
        res.end();
      }
    }
  }
);

// CSV 셀 값 추출 및 쉼표/따옴표 이스케이프
function extractVal(v: unknown): string {
  const raw = Array.isArray(v) ? (v[1] ?? v[0] ?? "") : (v ?? "");
  if (raw === null || raw === undefined || raw === "-") return "";
  const str = String(raw);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export { infoRouter };
