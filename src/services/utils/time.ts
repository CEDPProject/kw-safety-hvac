import moment from "moment";
import momentTimezone from "moment-timezone";
import "moment/locale/ko"; // 이줄 추가
import tzLookup from "tz-lookup";



const getUTCTimeFromTimeZone = (timeZone: number) => {
    console.log("timeZone : ", timeZone);
    if(timeZone == null) return new Date();
    
    // UTC 오프셋을 사용하여 현지 시간 계산
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000); // UTC 시간으로 변환
    const localTime = new Date(utcTime + (timeZone * 3600000)); // 타임존 오프셋 적용
    
    console.log("localTime : ", localTime);
    return localTime;
};

const getUTCDate = () => {
    const now = moment().utc();
    return now;
};

const parseDateString = (dateStr: string, minute?: boolean): Date => {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1; // 월은 0부터 시작
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(dateStr.substring(8, 10));

    if (minute) {
        const minute = parseInt(dateStr.substring(10, 12));
        return new Date(year, month, day, hour, minute);
    }

    return new Date(year, month, day, hour);
};

const diffTime = (date: Date | string, date2: Date | string): number => {
    const d = typeof date === "string" ? parseDateString(date) : date;
    const d2 = typeof date2 === "string" ? parseDateString(date2) : date2;
    if (d === null || d2 === null) {
        throw new Error("Both dates must be provided");
    }
    console.log("d", d);
    console.log("d2", d2);
    const diffInMilliseconds = Math.abs(d.getTime() - d2.getTime());
    const diffInHours = diffInMilliseconds / (1000 * 60 * 60);
    return diffInHours;
};

const formatDateToString = (date: Date | null): string => {
    if (date == null) {
        const defaultDate = new Date();
        return formatDateToString(defaultDate);
    }
    // 한국 시간으로 변환 (UTC+9)
    // const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const kstDate = date;

    const year = kstDate.getFullYear();
    const month = String(kstDate.getMonth() + 1).padStart(2, "0");
    const day = String(kstDate.getDate()).padStart(2, "0");
    const hour = String(kstDate.getHours()).padStart(2, "0");

    return `${year}${month}${day}${hour}`;
};

const formatDisaplyTime = (dateStr: string | null): string => {
   
    if(!dateStr) return "";
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) ; 
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(dateStr.substring(8, 10));

    let minute:string = "";
    dateStr.length > 10 ?  minute = dateStr.substring(10, 12) : minute = "00";

    return `${year}.${month}.${day} ${hour}:${minute}`;
};

const getUTCOffsetFromLonLat = (lat: number, lon: number): number => {
    try {
        const tz = tzLookup(lat, lon);
        
        // 주요 타임존별 UTC 오프셋 계산
        if (tz.includes('Asia/Seoul') || tz.includes('Asia/Tokyo')) {
            return 9; // UTC+9
        } else if (tz.includes('Asia/Shanghai') || tz.includes('Asia/Beijing')) {
            return 8; // UTC+8
        } else if (tz.includes('Asia/Kolkata') || tz.includes('Asia/Delhi')) {
            return 5.5; // UTC+5:30
        } else if (tz.includes('America/New_York')) {
            return -5; // UTC-5 (EST) / UTC-4 (EDT) - 여기서는 표준시 기준
        } else if (tz.includes('Europe/London')) {
            return 0; // UTC+0 (GMT) / UTC+1 (BST) - 여기서는 표준시 기준
        } else {
            // 경도 기반 대략적 오프셋 계산
            return Math.round(lon / 15);
        }
    } catch (error) {
        console.warn("타임존 오프셋 계산 실패:", error);
        return 9; // 기본값: 한국 시간
    }
};



const getNowKSTTimeYYYYMMDDHH = () => {
    const seoulTime = momentTimezone().tz("Asia/Seoul");
    return seoulTime.format("YYYYMMDDHH");
};

const getNowKSTTimeMMDDHH = () => {
    const seoulTime = momentTimezone().tz("Asia/Seoul");
    return seoulTime.format("MMDDHH");
};

const getNowKSTYYYYMMDDHH_MMSSMIN = (base?: string | Date) => {
  const seoulTime = base ? momentTimezone(base).tz("Asia/Seoul") : momentTimezone().tz("Asia/Seoul");
  // 해당 '날'의 최소값(자정)
  return seoulTime.format("YYYY/MM/DD HH:00:00");
};

const getNowKSTYYYYMMDDHH_MMSSMAX = (base?: string | Date) => {
  const seoulTime = base ? momentTimezone(base).tz("Asia/Seoul") : momentTimezone().tz("Asia/Seoul");
  // 해당 '날'의 최소값(자정)
  return seoulTime.format("YYYY/MM/DD 23:59:59");
};

const getNowKSTMinYYYYMMDDHH = (base?: string | Date) => {
    const seoulTime = base ? momentTimezone(base).tz("Asia/Seoul") : momentTimezone().tz("Asia/Seoul");
    // 해당 '날'의 최소값(자정)
    return seoulTime.format("YYYY/MM/DD-00:00:00");
};

const getNowKSTMaxYYYYMMDDHH = (base?: string | Date) => {
    const seoulTime = base ? momentTimezone(base).tz("Asia/Seoul") : momentTimezone().tz("Asia/Seoul");
    // 해당 '날'의 최대값(23:59:59)
    return seoulTime.format("YYYY/MM/DD-23:59:59");

}
const getNowKSTTZMinYYYYMMDDHH = (base?: string | Date) => {
    const seoulTime = base ? momentTimezone(base).tz("Asia/Seoul") : momentTimezone().tz("Asia/Seoul");
    // 해당 '날'의 최소값(자정)
    return seoulTime.format("YYYY-MM-DDT00:00:00");
};

const getNowKSTTZMaxYYYYMMDDHH = (base?: string | Date) => {
    const seoulTime = base ? momentTimezone(base).tz("Asia/Seoul") : momentTimezone().tz("Asia/Seoul");
    // 해당 '날'의 최대값(23:59:59)
    return seoulTime.format("YYYY-MM-DDT23:59:59");
};

const getNowKSTHourYYYYMMDDHH = (date: string) => {
    const seoulTime = momentTimezone(date).tz("Asia/Seoul");
    return seoulTime.format("YYYY/MM/DD-00:00:00");
};

const getNowKSTHourMaxYYYYMMDDHH = (date: string) => {
    const seoulTime = momentTimezone(date).tz("Asia/Seoul");
    return seoulTime.format("YYYY/MM/DD-23:59:59");
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** unix(초/ms) → KST 기준 YYYYMMDDHH */
const unixToYYYYMMDDHH_KST = (unix: number): string => {
  const ms = unix < 1e12 ? unix * 1000 : unix;        // 초 → ms 보정
  // KST=UTC+9, KST는 서머타임 없음 → +9h 후 UTC 게터 사용
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}`;
}

/** unix(초/ms) → KST 기준 YYYYMMDDHH */
const unixToYYYYMMDDHHMMSS_KST = (unix: number , addTime: number = 0): string => {
  const ms = unix < 1e12 ? unix * 1000 : unix;        // 초 → ms 보정
  // KST=UTC+9, KST는 서머타임 없음 → +9h 후 UTC 게터 사용
  const d = new Date(ms + (9 + addTime) * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`;
}



export {
    parseDateString,
    formatDateToString,
    diffTime,
    getUTCDate,
    getUTCOffsetFromLonLat,
    formatDisaplyTime,
    getUTCTimeFromTimeZone,
    getNowKSTTimeMMDDHH,
    getNowKSTMinYYYYMMDDHH,
    getNowKSTMaxYYYYMMDDHH,
    getNowKSTHourYYYYMMDDHH,
    getNowKSTHourMaxYYYYMMDDHH,
    unixToYYYYMMDDHH_KST,
    getNowKSTTimeYYYYMMDDHH,
    getNowKSTTZMinYYYYMMDDHH,
    getNowKSTTZMaxYYYYMMDDHH,
    getNowKSTYYYYMMDDHH_MMSSMIN,
    getNowKSTYYYYMMDDHH_MMSSMAX,
    unixToYYYYMMDDHHMMSS_KST
};
