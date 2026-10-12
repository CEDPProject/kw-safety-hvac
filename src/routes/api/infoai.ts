import { Request, Response, NextFunction, Router, response } from "express";

import axios from "axios";
import moment from "moment-timezone";
import { StationService } from "../../services/StationService";
import { AppDataSource } from "../../../config/database";
import { MemberDeviceControlManage } from "../../entities/MemberDeviceControlManage";
import { MemberDeviceManage } from "../../entities/MemberDeviceManage";
import { Device } from "../../entities/Device";
import { getTSDBVentData } from "../../services/tsdbData";
const baseUrl = "https://datacenter.kweather.co.kr/api/collection/v2/history";

interface IaqVentConInfoProps {
  iaq_device_idx: number;
  sensor_list: Array<{
    vent_device_idx: number;
    station_name: string;
    conSerialNum?: string;
    ventSerialNum?: string;
    serialNum?: string;
  }>;
}

const infoaiRouter = Router();

infoaiRouter.get(
    "/",
    async function (req: Request, res: Response, next: NextFunction) {
     
        const deviceList = await iaqVentConInfo(14430);
        console.log(deviceList);

        res.render("infoai", {deviceList : deviceList});
    }
  );

const iaqVentConInfo = async (memberIdx: number): Promise<IaqVentConInfoProps[]> => {
  const memberDeviceControlManageRepository = AppDataSource.getRepository(
    MemberDeviceControlManage
  );
  
  const result = await memberDeviceControlManageRepository
    .createQueryBuilder("A")
    .innerJoin(
      MemberDeviceManage,
      "B",
      "A.iaq_device_idx = B.device_idx"
    )
    .innerJoin(
      Device,
      "C",
      "A.ventDeviceIdx = C.idx"
    )
    .where("A.memberIdx = :memberIdx", { memberIdx })
    .groupBy("A.iaq_device_idx")
    .select([
      "A.iaq_device_idx AS iaq_device_idx",
      `JSON_ARRAYAGG(
        JSON_OBJECT(
          'vent_device_idx', A.ventDeviceIdx,
          'station_name', B.station_name,
          CASE
            WHEN C.serial_num LIKE 'CON%' THEN 'conSerialNum'
            WHEN C.serial_num LIKE 'KWV%' THEN 'ventSerialNum'
            ELSE 'serialNum'
          END, C.serial_num
        )
      ) AS sensor_list`
    ])
    .getRawMany();

  // JSON 문자열을 파싱하여 객체로 변환
  return result.map((row: any) => ({
    iaq_device_idx: row.iaq_device_idx,
    sensor_list: typeof row.sensor_list === 'string' 
      ? JSON.parse(row.sensor_list) 
      : row.sensor_list
  }));
};

  infoaiRouter.post(
    "/chartdata",
    async function (req: Request, res: Response, next: NextFunction) {
        const body = req.body;
        console.log("comm");
        console.log(body);
        let startDate = (body.startDate as string); // "YYYY-MM-DD HH:mm:ss"
        
        // 입력한 날짜시간값을 moment 객체로 파싱 (형식: "YYYY-MM-DD HH:mm:ss")
        const baseMoment = moment.tz(startDate, "YYYY-MM-DD HH:mm:ss", 'Asia/Seoul');
        
        // sMomentWatt: 입력한 날짜시간값 (그대로)
        const sMomentWatt = baseMoment.clone();
        
        // eMomentWatt: 입력한 날짜시간값의 +1시간
        const eMomentWatt = baseMoment.clone().add(1, 'hour');
        
        // sMomentPredWatt: 입력한 날짜시간값의 -1시간
        const sMomentPredWatt = baseMoment.clone().subtract(1, 'hour');
        
        // eMomentPredWatt: 입력한 날짜시간값의 +1시간
        const eMomentPredWatt = baseMoment.clone();

        const ventSerialNum = body.ventSerialNum as string;
        const conSerialNum = body.conSerialNum as string;

        // 형식 변환: "YYYY/MM/DD-HH:mm:ss" 형식으로 변환
        const startTime = sMomentWatt.format("YYYY/MM/DD-HH:mm:ss");
        const endTime = eMomentWatt.format("YYYY/MM/DD-HH:mm:ss");
        const startTimePred = sMomentPredWatt.format("YYYY/MM/DD-HH:mm:ss");
        const endTimePred = eMomentPredWatt.format("YYYY/MM/DD-HH:mm:ss");
        const downSample = body.downSample as string || "1m-avg-none";
        const sensor = "watt"
        const sensorPred = "pred_watt"

        console.log(startTime, endTime, startTimePred, endTimePred);

        const ventWattData = await getTSDBVentData(startTime, endTime, downSample, sensor , ventSerialNum);
        // console.log("ventWattData : " , ventWattData);
        let conWattData = await getTSDBVentData(startTime, endTime, downSample, sensor, conSerialNum);
        
        // conWattData 평균 보간 처리
        conWattData = interpolateConWattData(conWattData);
        
        console.log("conWattData : " , conWattData);
        const ventPredWattData = await getTSDBVentData(startTimePred, endTimePred, downSample, sensorPred , ventSerialNum);
        const conPredWattData = await getTSDBVentData(startTimePred, endTimePred, downSample, sensorPred, conSerialNum);
        res.json({ventWattData, conWattData, ventPredWattData, conPredWattData});
        // res.json({ventWattData});
    }
  );

/**
 * conWattData 평균 보간 함수
 * 0에서 0이 아닌 값으로 변할 때, 그 구간의 모든 값을 평균값으로 채움
 * 예: 19:01~19:09가 0이고 19:10이 100이면, 19:01~19:10까지 각각 10으로 설정
 */
function interpolateConWattData(data: Array<{ time: string; value: number }>): Array<{ time: string; value: number }> {
  if (!data || data.length === 0) return data;
  
  // 시간 순서로 정렬
  const sortedData = [...data].sort((a, b) => {
    const timeA = moment.tz(a.time, "YYYYMMDDHHmmss", 'Asia/Seoul');
    const timeB = moment.tz(b.time, "YYYYMMDDHHmmss", 'Asia/Seoul');
    return timeA.valueOf() - timeB.valueOf();
  });
  
  const result: Array<{ time: string; value: number }> = [];
  let i = 0;
  
  while (i < sortedData.length) {
    const current = sortedData[i];
    
    // 현재 값이 0이 아니면 그대로 추가
    if (current.value !== 0) {
      result.push(current);
      i++;
      continue;
    }
    
    // 현재 값이 0인 경우, 연속된 0 구간 찾기
    const zeroStartIndex = i;
    let zeroEndIndex = i;
    
    // 연속된 0 값들 찾기 (zeroEndIndex는 마지막 0 값의 인덱스)
    while (zeroEndIndex < sortedData.length && sortedData[zeroEndIndex].value === 0) {
      zeroEndIndex++;
    }
    // zeroEndIndex는 이제 첫 번째 0이 아닌 값의 인덱스 또는 배열 끝
    
    // 0 구간 다음에 0이 아닌 값이 있는지 확인
    if (zeroEndIndex < sortedData.length && sortedData[zeroEndIndex].value !== 0) {
      const nextNonZeroValue = sortedData[zeroEndIndex].value;
      const zeroStartTime = moment.tz(sortedData[zeroStartIndex].time, "YYYYMMDDHHmmss", 'Asia/Seoul');
      const nextNonZeroTime = moment.tz(sortedData[zeroEndIndex].time, "YYYYMMDDHHmmss", 'Asia/Seoul');
      
      // 분 단위 차이 계산 (0 시작부터 0이 아닌 값까지 포함)
      const minutesDiff = nextNonZeroTime.diff(zeroStartTime, 'minutes') + 1;
      
      if (minutesDiff > 0) {
        // 평균값 계산
        const avgValue = nextNonZeroValue / minutesDiff;
        
        // 0 구간부터 0이 아닌 값까지 모든 값을 평균값으로 설정
        for (let j = zeroStartIndex; j <= zeroEndIndex; j++) {
          result.push({
            time: sortedData[j].time,
            value: avgValue
          });
        }
        
        i = zeroEndIndex + 1;
      } else {
        // 분 차이가 없으면 그대로 추가
        result.push(current);
        i++;
      }
    } else {
      // 0 구간 다음에 0이 아닌 값이 없으면 그대로 추가
      for (let j = zeroStartIndex; j < zeroEndIndex; j++) {
        result.push(sortedData[j]);
      }
      i = zeroEndIndex;
    }
  }
  
  return result;
}

  export { infoaiRouter, iaqVentConInfo };