# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

IITP 에너지 최적화 안전공조시스템. TypeScript + Express.js 백엔드로 실내외 공기질(IAQ/OAQ)과 환기·냉난방 장치 데이터를 조회하고, 환기·냉난방 명령을 전송한다. 외부 K-Weather API에서 센서 데이터를 가져와 MySQL에 저장된 장치/회원 정보와 결합한다.

탄소 모니터링 플랫폼(`kw-carbon-map`)에서 분리된 리포다.

- `memberIdx: 14430` (iitp-livinglab)은 현재 하드코딩 상태 — 리팩토링 제안 불필요

## 명령어

```bash
npm run dev    # 개발 서버 (ts-node-dev)
npm run prd    # 프로덕션 실행
npm run build  # TypeScript 빌드 → ./build/
```

## 화면

| 경로 | 역할 |
| ---- | ---- |
| `/info` | IAQ 공간별 IAQ/OAQ/환기/냉난방 통합 조회, 차트·테이블·CSV |
| `/infoai` | IAQ ↔ 환기·냉난방 매핑 기반 전력/예측전력 차트 (TSDB) |
| `/control` | 환기·냉난방 명령 수동/스케줄 전송 |

## 주요 파일

| 파일                             | 역할                                                                       |
| -------------------------------- | -------------------------------------------------------------------------- |
| `src/index.ts`                   | Express 앱 진입점, 세션·CORS·정적 파일 설정                                |
| `config/database.ts`             | TypeORM DataSource (synchronize: false — 스키마 변경 시 수동 마이그레이션) |
| `src/entities/`                  | TypeORM 엔티티 (Device, Member, MemberDeviceManage 등)                     |
| `src/services/StationService.ts` | 센서 데이터 조회 서비스 (TypeORM 조회 → K-Weather API 호출 → 가공)         |
| `src/services/tsdbData.ts`       | TSDB 전력(watt/pred_watt) 조회                                             |
| `src/services/CommandScheduler.ts` | 명령 스케줄 전송·재시도·상태 폴링                                        |
| `src/routes/api/`                | `info.ts`, `infoai.ts`, `control.ts`                                       |
| `src/views/`                     | EJS 템플릿                                                                 |
| `public/`                        | 정적 자산 (JS/CSS/이미지, `json/control.json` 명령 목록)                   |

## 엔티티 매핑

- `TB_DEVICE` / `TB_DEVICE_MODEL` — 센서 장치 정보
- `TB_MEMBER` — 사용자
- `TB_MEMBER_DEVICE_MANAGE` — 회원별 장치 매핑 (station_name 포함)
- `TB_MEMBER_DEVICE_CONTROL_MANAGE` — IAQ ↔ 환기장치 매핑

## K-Weather 외부 API

- Endpoint: `https://datacenter.kweather.co.kr/api/collection/v2/history`
- 호출 방식: axios
- 응답 가공 후 JSON 반환 (주요 필드는 `StationService.ts` 참고)

## 환경변수 (.env)

```
DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_SCHEMA
SERVER_PORT   (기본: 8080)
TSDB_URL
NODE_ENV
```

## 인증 / 접근 제어

- `/private/inner_private`, `/private/inner_service` → `api-key: kweather` 헤더 필수
- 그 외 → express-session 기반 (sessionTimeout: 120분)
- 미인증 접근 → `external_access_error.ejs` 렌더링

## 배포

Jenkins → Kaniko → Harbor Registry(`iitp-climenv-safety`) → K8s 매니페스트(`iitp-climenv-safety/deployment.yaml`) 자동 업데이트 → Slack 알림
