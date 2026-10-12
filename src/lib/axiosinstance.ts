import axios from "axios";

const axiosInstance = axios.create({
  baseURL: '/poscoenc',
  withCredentials: true,
  timeout: 3000,
  headers: {
    "Content-Type": "application/json",
  },
});

// 요청 반환시 200코드가 아닐경우 에러처리 되지 않도록 설정
axiosInstance.interceptors.request.use((config) => {
  // API 요청 URL 로그 출력
  // console.log("🚀 [AXIOS] API 요청 시작:", new Date().toISOString());
  // console.log("🚀 [AXIOS] URL:", config.url);
  // console.log("🚀 [AXIOS] Method:", config.method?.toUpperCase());
  // if (config.params) {
  //   console.log("🚀 [AXIOS] Params:", config.params);
  // }
  // if (config.data) {
  //   console.log("🚀 [AXIOS] Data:", config.data);
  // }
  
  config.validateStatus = function (status) {
    return true;
  };
  return config;
});

export default axiosInstance;
