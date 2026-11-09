import type { Enemy, Partner } from './game/model'

const paths = {
  wave: 'M2 10c3-5 6 5 10 0s7-5 10 0M2 16c3-5 6 5 10 0s7-5 10 0',
  settings: 'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-4 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  archive: 'M4 8h16v12H4zM3 4h18v4H3zM9 12h6',
  undo: 'M9 5 4 10l5 5m-5-5h10a5 5 0 0 1 0 10h-3',
  redo: 'm15 5 5 5-5 5m5-5H10a5 5 0 0 0 0 10h3',
  plus: 'M12 5v14M5 12h14',
  edit: 'm14 5 5 5M5 19l4-1 11-11-4-4L5 14z',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  shield: 'M12 3 4 6v5c0 5 3 8 8 10 5-2 8-5 8-10V6l-8-3Zm-4 9 3 3 5-6',
  target: 'M12 2v4m0 12v4M2 12h4m12 0h4M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-5 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  close: 'm6 6 12 12M18 6 6 18',
  bottle: 'M9 3h6m-5 0v5l-3 4v7a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-7l-3-4V3M7 13h10m-10 4h10',
  trophy: 'M7 4h10v6a5 5 0 0 1-10 0V4ZM7 6H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4m-5 3v5m-4 0h8',
  fire: 'M12 3c3 5-1 6 2 9 2-1 3-3 3-3 6 7 1 12-5 12-5 0-9-4-6-10 0 3 2 4 3 3 2-2-2-5 3-11Z',
  ice: 'M12 2v20M3.3 7l17.4 10m0-10L3.3 17M9 4l3 3 3-3m-6 16 3-3 3 3M4 10l4-1-1-4m13 9-4 1 1 4M7 19l1-4-4-1m13-9-1 4 4 1',
  info: 'M12 11v5m0-8v.1M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0Z',
  skull: 'M7 18v3h10v-3a8 8 0 1 0-10 0Zm2-6h.1m5.9 0h.1M10 21v-3m4 3v-3',
  chevron: 'm9 6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 6v6l4 2m5-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  play: 'm8 5 11 7-11 7z',
  code: 'm8 5-6 7 6 7m8-14 6 7-6 7m-2-16-4 18',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5',
} as const

export function Icon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

export function Portrait({ partner }: { partner: Partner }) {
  const li = partner.role === 'li'
  return <svg className="portrait" viewBox="0 0 46 44" aria-hidden="true">
    <circle cx="23" cy="23" r="19" fill={li ? '#564729' : '#254652'} opacity=".9"/>
    {li ? <>
      <path d="M7 43c1-9 5-12 15-12s15 4 17 12" fill="#303a43"/>
      <path d="m15 35 7 7 8-7-4-5h-7z" fill="#8c6b4c"/>
      <path d="M13 18c0-8 5-11 10-11 7 0 12 4 11 12l-2 6c-2 5-5 9-10 9-5 0-9-6-10-10z" fill="#dfac78"/>
      <path d="m10 22 1-10 4-6 8-3 9 3 4 6-2 11-4-8-6 3 1-4-8 6-2-2-1 7z" fill="#141f25"/>
      <path d="M18 23h2m7 0h2m-7 6h3" stroke="#3b2a24" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="m32 26 10 3-4 13-10-3z" fill="#e9ba59"/><path d="m34 30 4 1-4 7m-2-4 5 1" fill="none" stroke="#945527" strokeWidth="1.3"/>
    </> : <>
      <path d="M9 23C8 12 13 5 23 4c11-1 17 10 15 22l3 15-10-3-18 2-5-3z" fill="#365b84"/>
      <path d="M8 44c2-9 9-13 15-13s13 4 15 13" fill="#a9c9d4"/>
      <path d="m14 35 9 8 9-8-4-5h-9z" fill="#619ac0"/>
      <path d="M13 18c0-7 4-11 11-11 7 0 11 7 10 13s-4 14-11 14c-6 0-10-7-10-16Z" fill="#e2b69e"/>
      <path d="M10 25c-2-11 2-19 12-21 8-1 13 4 15 9l-3 12-3-10-9-4c-1 7-7 7-8 12l-3 13-3 3z" fill="#597eae"/>
      <path d="M18 23h2m7 0h2m-7 6h3" stroke="#543d40" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="m34 29 6 1-1 5 2 4-2 4-8-2-1-4 4-3z" fill="#ad8ee0"/><path d="m34 29 6 1" stroke="#e3d8e8" strokeWidth="2"/>
    </>}
  </svg>
}

export function EnemyArt({ enemy }: { enemy: Enemy }) {
  if (enemy.kind === 'book') return <svg className="enemy-art" viewBox="0 0 40 40" aria-hidden="true">
    <path d="m10 6 20 4-3 24-20-4z" fill="#996837" stroke="#dfbe7c" strokeWidth="1.5"/>
    <path d="m14 8 16 2-3 21-16-3z" fill="#c4a46a"/><path d="m15 13 10 2m-11 3 10 2m-11 3 10 2" stroke="#604323" strokeWidth="1.7"/>
    <path d="m26 11 3 1-2 11-2-3-2 2z" fill="#a04d43"/>
  </svg>
  if (enemy.kind === 'bottle') return <svg className="enemy-art" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M15 9h10l-1 8c6 2 9 6 8 11-1 6-8 8-12 8S9 34 8 28c-1-5 3-9 8-11z" fill="#974448" stroke="#e59580" strokeWidth="1.4"/>
    <path d="M15 6h10v5H15z" fill="#e1ac75"/><path d="M11 26c6 3 13 4 19 0m-13-6c-4 2-5 4-5 5" fill="none" stroke="#e8a28e" strokeWidth="1.5"/>
  </svg>
  const special = enemy.kind === 'zombie' && enemy.variant !== 'normal'
  return <svg className="enemy-art" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M5 37c1-7 6-11 15-11 8 0 13 3 15 11" fill={special ? '#665677' : '#4e624e'}/>
    <path d="M10 19 7 9l8 2 5-5 6 4 7-1-2 13-3 8-9 4-8-6z" fill={special ? '#aca0bd' : '#a5b68d'}/>
    <path d="m9 16 2-8 8-5 12 4 2 10-7-4-5 3-6-3z" fill={special ? '#5f4a71' : '#50694d'}/>
    <path d="m13 20 5 1m5 0 5-1m-11 7 2 1 4-1" fill="none" stroke="#252b2b" strokeWidth="2.2" strokeLinecap="round"/>
    <path d="m27 16-2 2m-13 6 3 2" stroke={special ? '#d56c78' : '#69815e'} strokeWidth="1.4"/>
  </svg>
}

export function Radar() {
  return <svg className="radar" viewBox="0 0 160 115" fill="none" aria-hidden="true">
    <defs><linearGradient id="sweep" x1="80" y1="57" x2="126" y2="23" gradientUnits="userSpaceOnUse"><stop stopColor="#42d9c0" stopOpacity=".03"/><stop offset="1" stopColor="#42d9c0" stopOpacity=".37"/></linearGradient></defs>
    <path d="M80 8v99M23 57h114M42 19l76 76m0-76L42 95" stroke="#28433f" strokeDasharray="3 4"/>
    <circle cx="80" cy="57" r="47" stroke="#345d54"/><circle cx="80" cy="57" r="33" stroke="#2b4e49"/>
    <circle cx="80" cy="57" r="18" stroke="#2b4e49"/>
    <path d="M80 57V10a47 47 0 0 1 40 22L80 57Z" fill="url(#sweep)"/>
    <path d="m80 57 40-25" stroke="#61e6c9" strokeOpacity=".65"/>
    <circle cx="80" cy="57" r="3" fill="#72e6cb"/><circle cx="102" cy="40" r="3" fill="#72e6cb"/>
    <circle cx="57" cy="77" r="2" fill="#4a8a79"/><circle cx="108" cy="72" r="1.5" fill="#4a8a79"/>
    <path d="M24 23v-5h5m102 0h5v5M24 92v5h5m102 0h5v-5" stroke="#345d54"/>
  </svg>
}
