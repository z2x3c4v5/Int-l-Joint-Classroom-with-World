import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'ko' | 'en';

/**
 * Every UI string in both languages. The AI tutor itself always speaks
 * English (it's an English class); the UI around it follows this setting.
 */
const STRINGS = {
  // common
  'lang.toggle': { ko: 'English', en: '한국어' },
  'common.you': { ko: '나', en: 'you' },
  'common.cancel': { ko: '취소', en: 'Cancel' },
  'common.close': { ko: '닫기', en: 'Close' },

  // entry
  'entry.badge': { ko: '🌏 글로벌 영어 교실', en: '🌏 GLOBAL ENGLISH CLASSROOM' },
  'entry.title': { ko: '학교에 온 걸 환영해요!', en: 'Welcome to school!' },
  'entry.sub': { ko: '반 코드와 이름을 입력하고 입장하세요.', en: 'Type your class code and name, then walk in.' },
  'entry.code': { ko: '반 코드', en: 'Class code' },
  'entry.name': { ko: '내 이름', en: 'My name' },
  'entry.namePh': { ko: '민수, Mary, Hiroshi…', en: 'Mary, Hiroshi, 민수…' },
  'entry.foundMap': { ko: '🗺 학교 맵 수업을 찾았어요 ✓', en: '🗺 School map class found ✓' },
  'entry.foundMatch': { ko: '🤝 AI 1:1 매칭 수업을 찾았어요 ✓', en: '🤝 AI 1:1 match class found ✓' },
  'entry.from': { ko: '어디에서 왔나요?', en: "I'm from…" },
  'entry.korea': { ko: '🇰🇷 한국', en: '🇰🇷 Korea' },
  'entry.overseas': { ko: '🌐 해외', en: '🌐 Overseas' },
  'entry.topic': { ko: '이야기하고 싶은 주제 (선택)', en: 'Topic (optional)' },
  'entry.topicPh': { ko: '음식, 스포츠, K-pop, 학교…', en: 'food, sports, K-pop, school…' },
  'entry.enter': { ko: '🚪 학교 입장하기', en: '🚪 Enter the school' },
  'entry.findPartner': { ko: '✨ 짝꿍 찾기', en: '✨ Find my partner' },
  'entry.joining': { ko: '입장 중…', en: 'Joining…' },
  'entry.note': {
    ko: '카메라·마이크는 입장한 뒤에 켜져요. 가까이 있는 친구(또는 같은 책상)만 보고 들을 수 있어요.',
    en: 'Camera & mic turn on after you enter. Only people near you (or at the same desk) can see and hear you.',
  },
  'entry.errCode': { ko: '반 코드가 올바르지 않아요. 영문·숫자·- 3~16자로 입력하세요.', en: 'Class code looks wrong. Use 3–16 letters, numbers or dashes.' },
  'entry.errName': { ko: '이름은 2~16자로 입력하세요.', en: 'Please enter a 2–16 character name.' },
  'entry.errNoClass': { ko: '없는 반 코드예요. 선생님께 확인하세요.', en: 'That class code does not exist. Ask your teacher.' },
  'entry.errClosed': { ko: '아직 수업이 열리지 않았어요. 선생님께 말씀드리세요.', en: 'Class is not open yet. Ask your teacher to start it.' },
  'avatar.title': { ko: '내 캐릭터', en: 'MY CHARACTER' },
  'avatar.skin': { ko: '피부', en: 'Skin' },
  'avatar.hair': { ko: '머리', en: 'Hair' },
  'avatar.color': { ko: '머리색', en: 'Color' },
  'avatar.top': { ko: '상의', en: 'Top' },
  'avatar.pants': { ko: '하의', en: 'Pants' },
  'avatar.random': { ko: '🎲 랜덤', en: '🎲 Random' },
  'hair.0': { ko: '짧은', en: 'Short' },
  'hair.1': { ko: '긴', en: 'Long' },
  'hair.2': { ko: '삐죽', en: 'Spiky' },
  'hair.3': { ko: '양갈래', en: 'Buns' },

  // places
  'room.pa-polite': { ko: '예절 교실', en: 'Polite Room' },
  'room.pa-leading': { ko: '리더 교실', en: 'Leading Room' },
  'room.pa-useful': { ko: '생활 교실', en: 'Useful Room' },
  'room.pa-smart': { ko: '생각 교실', en: 'Smart Room' },
  'desk.name': { ko: '{room} {n}번 책상', en: '{room} · Desk {n}' },

  // classroom HUD
  'hud.hallway': { ko: '🚶 복도', en: '🚶 Hallway' },
  'hud.inRoom': { ko: '{room} · 자유롭게 이동', en: '{room} · walk around' },
  'hud.inDesk': { ko: '🔒 {desk} (프라이빗)', en: '🔒 {desk} (private)' },
  'hud.connecting': { ko: '연결 중', en: 'connecting' },
  'hud.help1': { ko: '이동', en: 'move' },
  'hud.help2': { ko: '클릭: 그곳으로 걷기 · Space: 점프', en: 'Click: walk there · Space: jump' },
  'hud.help3': { ko: '책상 구역에 들어가면 둘만의 대화 + AI 튜터', en: 'Step onto a desk zone for a private talk + AI tutor' },
  'hud.camOn': { ko: '🎥 카메라·마이크 켜기', en: '🎥 Camera & mic on' },
  'hud.mute': { ko: '마이크 끄기', en: 'Mute' },
  'hud.unmute': { ko: '마이크 켜기', en: 'Unmute' },
  'hud.camOff': { ko: '카메라 끄기', en: 'Camera off' },
  'hud.camOnBtn': { ko: '카메라 켜기', en: 'Camera on' },
  'hud.share': { ko: '화면 공유', en: 'Share screen' },
  'hud.emoji': { ko: '이모지', en: 'Emoji' },
  'hud.online': { ko: '접속 중', en: 'Online' },
  'hud.leave': { ko: '나가기', en: 'Leave' },
  'hud.tapAudio': { ko: '🔊 눌러서 소리 듣기', en: '🔊 Tap to hear others' },
  'hud.map': { ko: '지도', en: 'Map' },
  'hud.deskWait': { ko: '🦉 친구 한 명이 이 책상에 오면 AI 튜터가 시작해요.', en: '🦉 The AI tutor starts when one more student joins this desk.' },
  'hud.deskFull': { ko: '🦉 AI 튜터는 책상에 딱 2명일 때 진행해요.', en: '🦉 The AI tutor leads when exactly 2 students are at the desk.' },
  'hud.openTutor': { ko: '🦉 AI 튜터 열기', en: '🦉 Open AI Tutor' },
  'hud.nearby': { ko: '가까이 {n}명', en: '{n} nearby' },
  'hud.screenSharing': { ko: '🖥 화면 공유 중 — {name}', en: '🖥 Screen sharing — {name}' },
  'hud.stopShare': { ko: '공유 중지', en: 'Stop sharing' },

  // tutor
  'tutor.title': { ko: 'AI 튜터', en: 'AI Tutor' },
  'tutor.auto': { ko: '● 자동 진행', en: '● Auto-leading' },
  'tutor.manual': { ko: '○ 수동', en: '○ Manual' },
  'tutor.autoTip': { ko: '켜 두면 튜터가 알아서 대화를 이어가요.', en: 'When on, the tutor leads the conversation on its own.' },
  'tutor.ready': { ko: '튜터가 인사를 준비하고 있어요…', en: 'The tutor is getting ready to say hello…' },
  'tutor.thinking': { ko: '튜터가 생각 중…', en: 'Tutor is thinking…' },
  'tutor.next': { ko: '💬 새 질문', en: '💬 New question' },
  'tutor.help': { ko: '🆘 도와줘요', en: '🆘 Help me' },
  'tutor.talk': { ko: '🎤 발표하기', en: '🎤 My talk' },
  'tutor.stop': { ko: '⏹ 끝! 피드백 받기', en: '⏹ Done! Get feedback' },
  'tutor.listening': { ko: '듣고 있어요… 영어로 말해 보세요', en: 'Listening… speak in English' },
  'tutor.noSpeech': { ko: '이 브라우저는 음성 인식을 지원하지 않아요. 할 말을 입력하세요.', en: "This browser can't listen. Type what you said instead." },
  'tutor.typePh': { ko: '내가 말한 내용 (영어)', en: 'What I said (in English)' },
  'tutor.send': { ko: '피드백 받기', en: 'Get feedback' },
  'tutor.heard': { ko: '들은 내용', en: 'I heard' },
  'tutor.tag.help': { ko: '🆘 도움', en: '🆘 Help' },
  'tutor.tag.start': { ko: '👋 인사', en: '👋 Welcome' },
  'tutor.tag.next': { ko: '💬 질문', en: '💬 Question' },
  'tutor.tag.feedback': { ko: '⭐ 발표 피드백', en: '⭐ Talk feedback' },
  'tutor.readAloud': { ko: '소리 내어 읽기', en: 'Read aloud' },

  // boards
  'board.add': { ko: '＋ 올리기', en: '＋ Add' },
  'board.replace': { ko: '↻ 바꾸기', en: '↻ Replace' },
  'board.upload': { ko: '🖼 이미지 올리기', en: '🖼 Upload image' },
  'board.slidesPh': { ko: '구글 슬라이드 주소 붙여넣기', en: 'Paste Google Slides URL' },
  'board.go': { ko: '확인', en: 'Go' },
  'board.pending': { ko: '📊 선생님 승인을 기다리는 중', en: '📊 Waiting for teacher approval' },
  'board.removed': { ko: '⚠️ 검토 후 삭제됨', en: '⚠️ Removed by moderation' },
  'board.by': { ko: '{name} 올림', en: 'by {name}' },
  'board.errImage': { ko: '이미지 파일만 올릴 수 있어요.', en: 'Image files only.' },
  'board.errSize': { ko: '최대 8MB까지 올릴 수 있어요.', en: 'Max 8MB.' },
  'board.errSlides': { ko: '구글 슬라이드 공유 링크(docs.google.com/presentation/...)를 붙여넣으세요.', en: 'Paste a Google Slides share link (docs.google.com/presentation/...).' },
  'board.welcome1': { ko: '🌐 글로벌 영어 교실', en: '🌐 GLOBAL ENGLISH CLASSROOM' },
  'board.welcome2': { ko: '한국 · 말레이시아 · 대만 · 태국', en: 'Korea · Malaysia · Taiwan · Thailand' },

  // match mode
  'wait.title': { ko: '짝꿍을 찾고 있어요…', en: 'Looking for your partner…' },
  'wait.kr': { ko: 'AI가 해외 친구를 찾고 있어요.', en: 'The AI is finding a friend from overseas for you.' },
  'wait.intl': { ko: 'AI가 한국 친구를 찾고 있어요.', en: 'The AI is finding a Korean friend for you.' },
  'wait.topic': { ko: '주제: {topic}', en: 'Topic: {topic}' },
  'wait.cancel': { ko: '취소하고 돌아가기', en: 'Cancel and go back' },
  'wait.note': { ko: '짝꿍이 준비되면 카메라와 마이크가 자동으로 켜져요. 둘만 서로 보고 들을 수 있어요.', en: 'Camera and mic turn on automatically when your partner is ready. Only the two of you see and hear each other.' },
  'pair.title': { ko: '🤝 1:1 영어 대화방', en: '🤝 1:1 English Room' },
  'pair.new': { ko: '🔄 새 짝꿍', en: '🔄 New partner' },
  'pair.leave': { ko: '나가기', en: 'Leave' },
  'pair.connecting': { ko: '카메라 연결 중…', en: 'Connecting your camera…' },
  'pair.ready': { ko: '준비 중…', en: 'Getting ready…' },
  'pair.waitPartner': { ko: '짝꿍이 연결되기를 기다리는 중…', en: 'Waiting for your partner to connect…' },
  'pair.tapAudio': { ko: '🔊 눌러서 짝꿍 소리 듣기', en: '🔊 Tap to hear your partner' },
  'pair.shareStop': { ko: '🛑 공유 중지', en: '🛑 Stop sharing' },
  'pair.share': { ko: '🖥 내 화면 공유', en: '🖥 Share my screen' },

  // teacher
  'teacher.title': { ko: '👩‍🏫 선생님 화면', en: '👩‍🏫 Teacher Panel' },
  'teacher.passcode': { ko: '선생님 비밀번호', en: 'Teacher passcode' },
  'teacher.unlock': { ko: '열기', en: 'Unlock' },
  'teacher.passNote': { ko: '비밀번호는 모든 작업마다 서버에서 확인해요.', en: 'The passcode is checked server-side on every action.' },
  'teacher.sessions': { ko: '📚 수업 목록', en: '📚 Sessions' },
  'teacher.codePh': { ko: '반 코드 (예: DEOKCHEON-1)', en: 'Code (e.g. DEOKCHEON-1)' },
  'teacher.titlePh': { ko: '수업 이름 (선택)', en: 'Title (optional)' },
  'teacher.modeFree': { ko: '🗺 학교 맵', en: '🗺 School map' },
  'teacher.modeMatch': { ko: '🤝 AI 1:1 매칭', en: '🤝 AI 1:1 match' },
  'teacher.create': { ko: '+ 수업 만들기', en: '+ Create session' },
  'teacher.errCode': { ko: '반 코드: 영문 대문자·숫자·- 3~16자', en: 'Code: 3–16 of A–Z 0–9 -' },
  'teacher.live': { ko: '● 진행 중', en: '● live' },
  'teacher.closed': { ko: '○ 닫힘', en: '○ closed' },
  'teacher.none': { ko: '아직 수업이 없어요. 위에서 만들어 보세요.', en: 'No sessions yet. Create one above.' },
  'teacher.pick': { ko: '왼쪽에서 수업을 고르세요.', en: 'Pick a session on the left.' },
  'teacher.closeSession': { ko: '수업 닫기', en: 'Close session' },
  'teacher.openSession': { ko: '수업 열기', en: 'Open session' },
  'teacher.copy': { ko: '학생 주소 복사', en: 'Copy student URL' },
  'teacher.copied': { ko: '복사됨 ✓', en: 'Copied ✓' },
  'teacher.queue': { ko: '올린 자료 검토', en: 'Moderation queue' },
  'teacher.approve': { ko: '승인', en: 'Approve' },
  'teacher.reject': { ko: '거절', en: 'Reject' },
  'teacher.noUploads': { ko: '아직 올린 자료가 없어요.', en: 'No uploads yet in this session.' },
  'teacher.status': { ko: '상태', en: 'Status' },
  'teacher.empty': { ko: '비어 있음', en: 'empty' },
} as const;

export type StringKey = keyof typeof STRINGS;

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
}

const LangContext = createContext<Ctx | null>(null);
const KEY = 'gc.lang';

function initialLang(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'ko' || s === 'en') return s;
  } catch {
    /* storage blocked */
  }
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('ko') ? 'ko' : 'en';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* storage blocked */
    }
  }, [lang]);
  const t = (key: StringKey, vars?: Record<string, string | number>) => {
    let s: string = STRINGS[key]?.[lang] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(LangContext);
  if (!c) throw new Error('useI18n outside LangProvider');
  return c;
}

/** 🇰🇷 / 🇺🇸 pill that flips the whole UI. */
export function LangToggle({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <button
      type="button"
      data-ui
      onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
      className={`inline-flex items-center gap-1 rounded-full bg-white/95 text-slate-700 shadow-lg px-3 py-1.5 text-xs font-bold hover:bg-white transition ${className}`}
      title="한국어 / English"
    >
      <span className={lang === 'ko' ? 'opacity-100' : 'opacity-40'}>한</span>
      <span className="opacity-30">|</span>
      <span className={lang === 'en' ? 'opacity-100' : 'opacity-40'}>EN</span>
    </button>
  );
}
