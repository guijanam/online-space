# 쉼터 — 승무원 온라인 힐링공간

열차 승무원이 쉬는 시간에 들어와 머무는 3D 공간이다. 채팅은 없고, 서로의 **위치와 행동(이모트)** 만 보인다. 행동에는 쿨타임이 있다.

- Vite + Three.js(TypeScript), 모바일 세로 화면 전용
- 서버 없이 [Trystero](https://github.com/dmotz/trystero)(WebRTC P2P, Nostr 시그널링)로 사용자끼리 직접 연결
- `main`에 push하면 GitHub Actions가 GitHub Pages에 배포
- 근무앱은 배포 주소를 웹뷰로 띄우기만 하면 된다 (연동 없음)

## 개발

```bash
npm install
npm run dev     # http://localhost:5173  (?cap=2 로 방 정원을 줄여서 분할 테스트)
npm test        # 단위 테스트 (쿨타임/도배 필터/프로토콜/방 분할)
npm run build   # dist/
```

개발 모드에서는 콘솔에서 `__space.room`, `__space.peers`, `__space.spam('wave', 20)`(쿨타임을 우회한 도배 테스트)를 쓸 수 있다.

## 배포 (GitHub Pages)

1. GitHub에 저장소를 만들고 push한다 (무료 플랜은 **public 저장소**여야 Pages를 쓸 수 있다).
2. 저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로 바꾼다.
3. `main`에 push하면 `.github/workflows/deploy.yml`이 테스트 → 빌드 → 배포를 실행한다.
4. 주소는 `https://<계정>.github.io/<저장소>/` 이다. 이 주소를 근무앱 웹뷰에 넣는다.

## 구조

| 파일 | 역할 |
| --- | --- |
| `src/config.ts` | APP_ID, 방 정원, TURN 설정 |
| `src/actions.ts` | 행동 목록과 쿨타임 (여기만 고치면 버튼과 수신 필터가 같이 바뀜) |
| `src/protocol.ts` | P2P 메시지 스키마. 자유 텍스트는 실을 수 없다 |
| `src/net/strategy.ts` | 시그널링 전략 교체 지점 (Nostr → MQTT 등) |
| `src/net/Lobby.ts` | 서버 없이 방을 나누는 로직 |
| `src/net/PeerSync.ts` | 송수신 + 받는 쪽 검증 |
| `src/net/limits.ts` | 보내는 쪽 쿨타임 / 받는 쪽 도배 필터 |
| `src/scene/World.ts` | **공간 테마** (컨셉이 정해지면 이 파일만 교체) |
| `src/scene/Avatar.ts` | 아바타와 행동 애니메이션 |

## 도배 방지 방식

서버가 없기 때문에 두 군데에서 막는다.
- **보내는 쪽**: 행동별 쿨타임 + 10초에 4회 전역 제한. 쿨타임 중인 버튼은 잠긴다.
- **받는 쪽**: 같은 기준(지연 오차 허용)으로 걸러서 화면에 그리지 않는다. 계속 어기는 피어는 그 세션 동안 숨긴다.

그래서 누가 클라이언트를 조작해서 도배를 보내도 다른 사람 화면에는 정상 속도로만 보인다.

## 운영 메모

- **연결 실패가 잦을 때**: 통신사·사내망 NAT 때문에 P2P 연결이 안 되는 경우가 있다. `src/config.ts`의 `TURN`에 TURN 서버를 추가한다.
- **Nostr 릴레이가 불안정할 때**: `src/net/strategy.ts`에서 `@trystero-p2p/mqtt`로 바꾼다.
- **접근 제한 없음**: 주소를 아는 사람은 일반 브라우저로도 들어올 수 있다. 페이지에 링크·공유·선택·길게 누르기 메뉴가 없고, 검색엔진 색인도 막혀 있다.
- **근무앱 쪽 권장 설정 (선택)**: 릴리스 빌드에서 웹뷰 디버깅을 끈다 (iOS `isInspectable = false`, Android `WebView.setWebContentsDebuggingEnabled(false)`). iOS는 `allowsLinkPreview = false`도 설정한다. WebRTC DataChannel은 iOS 14.3 이상 WKWebView와 Android WebView에서 동작한다.
