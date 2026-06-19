# HANDOFF — Global Classroom (Int'l Joint Classroom with World)

이 문서는 **새 Claude Code 세션 첫 메시지에 통째로 붙여넣어** 작업을 이어가기
위한 인계 문서입니다. 핵심 정보 + 다음에 할 일이 한 화면에 정리되어 있습니다.

---

## 1. 프로젝트 한 줄 설명

초등 영어 국제교류용 ZEP 대안 웹앱. **자유 이동 + 프라이빗 영역 음성/영상**
(4-룸 ZEP 모드) **+ AI가 한국·해외 학생을 자동 1:1 매칭하고 진행자 역할**
(AI Match 모드) 두 가지 수업 모드를 한 앱에서 운영. Firebase + LiveKit Cloud +
OpenAI(gpt-4o-mini) 조합으로 동시 70명까지 안정. 월 비용 약 5만 원.

## 2. 기술 스택

- **프론트**: Vite + React 19 + TypeScript + Tailwind v4
- **인증**: Firebase Anonymous Auth (닉네임만)
- **DB**: Firestore(세션/오브젝트/큐/페어), Realtime DB(위치 동기화)
- **Storage**: Firebase Storage (학생 업로드 이미지)
- **미디어**: LiveKit Cloud (PA 룸 + 페어 룸 동일 토큰 발급)
- **Functions** (Node 20, v2 onCall/onObjectFinalized/onDocumentCreated):
  - `mintLiveKitToken` — 세션×PA 검증 후 토큰 발급
  - `moderateUploadedImage` — Vision SafeSearch
  - `matchPlayers` — KR↔INTL 자동 페어링 (트랜잭션)
  - `facilitatorTurn` — gpt-4o-mini로 AI 진행자 응답 생성
  - `endPair` — 페어 종료 + 옵션으로 재큐
  - `createSession` / `setSessionActive` / `moderateObject` — 선생님 액션

## 3. 폴더 구조

```
.
├── README.md                 # 설치/배포 가이드
├── HANDOFF.md                # (이 파일)
├── vercel.json               # SPA fallback (필수)
├── firebase.json             # Hosting/Functions/Rules 설정
├── firestore.rules           # 세션/오브젝트/큐/페어 보안 규칙
├── storage.rules             # 8MB 이미지만, 활성 세션만
├── database.rules.json       # rooms/{code}/players
├── .env.example              # 9개 VITE_ 환경변수
├── package.json              # vite/react19/tailwind v4/livekit/firebase
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx              # /, /teacher, /preview 라우팅
│   ├── App.tsx               # mode === 'match' ? MatchModeFlow : Classroom
│   ├── styles.css            # @import "tailwindcss"
│   ├── vite-env.d.ts
│   ├── lib/
│   │   ├── firebase.ts       # init + signInWithNickname
│   │   ├── session.ts        # SessionMode, fetchSession
│   │   ├── matchmaking.ts    # enqueueForMatch / dequeue
│   │   ├── mapConfig.ts      # 4-룸 + 좌석 + 보드 좌표
│   │   └── uploadImage.ts    # 다운스케일 + Firestore set
│   ├── hooks/
│   │   ├── usePresence.ts          # RTDB 위치 동기화
│   │   ├── useKeyboardMovement.ts  # 키보드 + 조이스틱
│   │   ├── useLiveKitForPA.ts      # PA/페어 룸 자동 join/leave
│   │   ├── usePresentationObjects.ts
│   │   ├── useMatchQueue.ts        # 큐 상태 구독 → paired면 페어 룸으로
│   │   └── useFacilitator.ts       # 진행자 메시지 구독 + 트리거
│   ├── components/
│   │   ├── NicknameEntry.tsx       # 코드 + 이름 + (match면) 국가/주제
│   │   ├── ClassroomBackdrop.tsx   # 4-룸 시각 레이어
│   │   ├── Avatar.tsx
│   │   ├── PresentationSlot.tsx    # 이미지/Slides 업로드 UI
│   │   ├── LocalVideoTile.tsx
│   │   ├── VideoTile.tsx
│   │   ├── ScreenShareTile.tsx
│   │   ├── TouchJoystick.tsx       # 모바일 조이스틱
│   │   ├── WaitingRoom.tsx         # 매칭 대기 화면
│   │   ├── PairRoom.tsx            # 1:1 + AI 코치 패널
│   │   └── FacilitatorPanel.tsx    # 코치 메시지 + 버튼
│   └── pages/
│       ├── TeacherPanel.tsx        # 세션 생성/모드선택/모더레이션
│       └── Preview.tsx             # Firebase 없이 보이는 데모 라우트
└── functions/
    ├── package.json
    ├── tsconfig.json
    └── src/index.ts          # 위 7개 Function
```

## 4. 데이터 모델 (Firestore)

```
sessions/{code}
  title, active, mode: 'free'|'match', createdAt, createdBy

sessions/{code}/objects/{objectId}
  type: 'image'|'slides', imageUrl|slidesUrl, ownerUid, ownerName,
  status: 'pending'|'approved'|'rejected', updatedAt, safeSearch{...}

sessions/{code}/queue/{uid}              ← match 모드 전용
  name, country: 'KR'|'INTL', topic, status: 'waiting'|'paired',
  pairId?, pairRoomId?, joinedAt

sessions/{code}/pairs/{pairId}            ← matchPlayers가 생성
  roomId: 'pair-XXXX', members: [{uid,name,country,topic}, ...],
  topic, status: 'active'|'ended', createdAt, endedAt

sessions/{code}/pairs/{pairId}/facilitatorMessages/{msgId}
  role: 'facilitator', text, action: 'start'|'next'|'help', ts
```

### Realtime DB
```
rooms/{code}/players/{uid}: { name, x, y, paId, ts }
```

### Storage
```
presentations/{code}/{objectId}/{filename}.jpg
```

## 5. 보안 모델 요점

- **LiveKit 토큰**: 룸 이름 = `{sessionCode}__{paId}` 형태이고 정규식
  (`^[A-Z0-9-]{3,16}$`, `^(pa|pair)-[a-z0-9-]+$`) 양쪽 검증. 토큰 발급 전
  세션 active 확인.
- **Firestore 클라 쓰기**: 본인 큐 입력만 가능, 상태 `waiting` 강제,
  세션 active일 때만. `paired`로 바꾸는 건 Function만.
- **선생님 액션**: 모든 Callable에서 `TEACHER_PASSCODE` secret 비교.
- **Storage**: 8MB image/*, 경로의 `sessionCode`가 active이어야 업로드 허용.
- **Vision SafeSearch**: adult/violence/racy ≥ LIKELY면 자동 reject, 통과는
  자동 approve. 선생님은 패널에서 임의로 override.

## 6. 외부 의존성 (선생님이 한 번 셋업)

1. **Firebase 프로젝트** (Blaze 플랜) — Auth/Firestore/RTDB/Storage 활성화, Vision API 활성화
2. **LiveKit Cloud** 프로젝트 — WS URL/API Key/Secret 발급
3. **OpenAI 계정** — API Key 발급
4. **Vercel 또는 Firebase Hosting** — 배포

Functions Secrets (한 번씩):
```bash
firebase functions:secrets:set LIVEKIT_API_KEY
firebase functions:secrets:set LIVEKIT_API_SECRET
firebase functions:secrets:set TEACHER_PASSCODE
firebase functions:secrets:set OPENAI_API_KEY
firebase deploy --only firestore:rules,storage:rules,database,functions
```

프론트 `.env`는 `.env.example` 참고. Vercel에 환경변수 9개 입력하면 끝.

## 7. 다음에 할 일 후보 (우선순위 순)

1. **출석/참여 로그 CSV** — 세션 종료 후 누가 언제 들어와서 어떤 발표를 했는지
   선생님이 다운로드. 학교 평가에 직접 활용.
2. **번들 코드 스플릿** — 현재 1.4MB → LiveKit/Firebase lazy load로 약 400KB.
   첫 로드 속도 체감 차이 큼.
3. **AI 코치 음성 인식** — 학생 발화를 Whisper로 듣고 코치가 정정/칭찬.
   비용은 분당 약 $0.006.
4. **모드 동적 전환** — 한 세션에서 Free ↔ Match 토글. 지금은 세션 생성 시 고정.
5. **세션 자동 종료 + 정리** — 시간 끝나면 RTDB players 일괄 삭제, objects
   아카이브.
6. **픽셀 아트 룩** — Kenney.nl 무료 학교 타일셋으로 진짜 ZEP스러운 비주얼.

## 8. 알려진 함정

- **모바일 Safari**: 카메라/마이크는 첫 사용자 제스처 후에만 가능. Join /
  Find-partner 버튼이 그 제스처 역할. 자동 입장 금지.
- **번들 1.4MB**: 첫 진입 늦음. 코드 스플릿 안 했음.
- **AI 코치는 듣지 않음**: 현재는 학생 버튼 누를 때만 새 메시지. 자동 개입 없음.
- **PPT 직접 임베드 불가**: Google Slides 링크 또는 PDF 변환 필요.

## 9. 작업 시 체크리스트

- 코드 변경 후 항상 `npx tsc --noEmit -p .` 양쪽(client/functions) 통과 확인
- `npm run build`로 프로덕션 빌드 사전 확인
- LiveKit 룸 이름 규칙 (`pa-*` / `pair-*`) 깨지 않게
- Firestore 보안 규칙 변경 시 deploy 잊지 않기
- OpenAI 호출은 timeout 30s, max_tokens 120으로 묶여 있음 — 늘리면 비용 ↑

## 10. 작업 시 행동 지침

- 한국어로 응답, 짧고 직접적으로
- 새 기능 추가 전에 보안 규칙·LiveKit 토큰·Firestore 트랜잭션 영향 먼저 검토
- 사용자 명시 요청 없이 외부 호출/배포 금지
- gpt-4o-mini 외 모델로 바꾸지 말 것 (비용 폭증)
