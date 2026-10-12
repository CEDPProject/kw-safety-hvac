import axiosInstance from "../lib/axiosinstance";
import {  unixToYYYYMMDDHHMMSS_KST } from "./utils/time";

export const getTSDBVentData = async (startDate: string, endDate: string, downSample: string, sensor: string, serialNum: string) => {
    
   

    // console.log("시작일 : " , (startDate));
    // console.log("끝일 : " ,(endDate));
    // console.log("센서 : " ,(sensor));
    // console.log("시리얼번호 : " ,(serialNum));
    

    const body = {
        timezone: 'Asia/Seoul',
        useCalendar: true,
        start: startDate,
        end: endDate,
        queries: [
            {
                downsample: downSample ? downSample : '1m-avg-none',
                aggregator: 'sum',
                metric: `kw-vent-sensor-kiot.${serialNum}`,
                tags: {
                    sensor: sensor,
                },
            },
        ],
    };

    // console.log("body : " , body);

    const resp = await axiosInstance.post(`${process.env.TSDB_URL}/api/query`, body, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    
    let data = resp.data;
    // console.log("TSDB Raw Response:", JSON.stringify(data, null, 2));
    type Point = { time: string; value: number };
    const results: Point[] = [];
    
    if (!Array.isArray(data)) {
        console.error("TSDB response is not an array:", data);
        return results;
    }
    
    // console.log("TSDB response array length:", data.length);
    
    for (const row of data) {
        const sensor = String(row?.tags?.sensor ?? '');
        // console.log("Processing row with sensor:", sensor);
        // console.log("Row dps keys count:", row?.dps ? Object.keys(row.dps).length : 0);
        
        // if (!sensor) {
        //     console.warn("Row has no sensor tag, skipping:", row);
        //     continue;
        // }
      
      
        
        if (!row?.dps || Object.keys(row.dps).length === 0) {
            // console.warn("Row has no dps data:", row);
            continue;
        }
        
        for (const [ts, val] of Object.entries(row.dps)) {
            let timeStr = '';
            if(sensor === 'watt') {
                timeStr = unixToYYYYMMDDHHMMSS_KST(Number(ts));
            } else {
                timeStr = unixToYYYYMMDDHHMMSS_KST(Number(ts), 1);
            }
            results.push({
                time: timeStr,
                value: Number(val as number),
            });
        }
        
       
    }
    

    return results;
};