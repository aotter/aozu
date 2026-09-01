'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

import { ADVENTURE_SCORE_KEY, parseAdventureScores, recordAdventureScore, type AdventureMode } from '../companion/adventure.ts';

type GamePartner = { displayName: string; image: string; kind: 'mascot' | 'human' };
type Spirit = { id: number; x: number; y: number; size: number };
type Shot = { id: number; x: number; y: number };
type Trash = { id: number; x: number; icon: string; passed: boolean };

const trashIcons = ['🧃', '🥤', '🛍️', '🥫'];

export function AdventureGame({ mode, partner, onClose }: { mode: AdventureMode; partner: GamePartner; onClose(): void }) {
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => typeof window === 'undefined' ? 0 : parseAdventureScores(localStorage.getItem(ADVENTURE_SCORE_KEY))[mode]);
  const [spirits, setSpirits] = useState<Spirit[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [trash, setTrash] = useState<Trash[]>([]);
  const [jumping, setJumping] = useState(false);
  const [hit, setHit] = useState(false);
  const jumpingRef = useRef(false);
  const idRef = useRef(0);
  const tickRef = useRef(0);
  const scoreRef = useRef(0);

  const changeScore = useCallback((amount: number) => {
    const next = Math.max(0, scoreRef.current + amount);
    scoreRef.current = next;
    setBest(recordAdventureScore(localStorage, mode, next)[mode]);
    setScore(next);
  }, [mode]);

  useEffect(() => {
    if (!running || mode !== 'room') return;
    const timer = window.setInterval(() => {
      const id = ++idRef.current;
      setSpirits((items) => [...items.slice(-9), { id, x: 22 + Math.random() * 65, y: 16 + Math.random() * 52, size: 38 + Math.random() * 30 }]);
    }, 680);
    return () => window.clearInterval(timer);
  }, [mode, running]);

  useEffect(() => {
    if (!running || mode !== 'forest') return;
    const timer = window.setInterval(() => {
      tickRef.current += 1;
      setTrash((items) => {
        const moved = items.map((item) => {
          const next = { ...item, x: item.x - 1.25 };
          if (!next.passed && next.x <= 22) {
            next.passed = true;
            if (jumpingRef.current) changeScore(15);
            else {
              changeScore(-5);
              setHit(true);
              window.setTimeout(() => setHit(false), 260);
            }
          }
          return next;
        }).filter(({ x }) => x > -8);
        if (tickRef.current % 31 === 0) moved.push({ id: ++idRef.current, x: 104, icon: trashIcons[idRef.current % trashIcons.length], passed: false });
        return moved;
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [changeScore, mode, running]);

  const jump = useCallback(() => {
    if (!running || mode !== 'forest' || jumpingRef.current) return;
    jumpingRef.current = true;
    setJumping(true);
    window.setTimeout(() => {
      jumpingRef.current = false;
      setJumping(false);
    }, 650);
  }, [mode, running]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      jump();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [jump]);

  const start = () => {
    scoreRef.current = 0;
    setScore(0);
    setSpirits([]);
    setShots([]);
    setTrash([]);
    tickRef.current = 0;
    setRunning(true);
  };

  const shoot = (spirit: Spirit) => {
    if (!running) return;
    setSpirits((items) => items.filter(({ id }) => id !== spirit.id));
    setShots((items) => [...items, { id: spirit.id, x: spirit.x, y: spirit.y }]);
    changeScore(10);
    window.setTimeout(() => setShots((items) => items.filter(({ id }) => id !== spirit.id)), 320);
  };

  return <section className={`adventure-overlay mode-${mode} ${hit ? 'is-hit' : ''}`} aria-label={mode === 'room' ? '房間橡皮筋射擊遊戲' : '森林跳躍遊戲'}>
    <div className="adventure-backdrop" />
    <header className="adventure-hud">
      <div><span>AOZU ADVENTURE</span><strong>{mode === 'room' ? '黑炭精靈大作戰' : '風之森林淨路行動'}</strong></div>
      <p><span>分數 <b>{score}</b></span><span>最高 <b>{best}</b></span></p>
      <button type="button" onClick={onClose}>結束冒險</button>
    </header>

    <div className="adventure-character-wrap">
      <img className={`adventure-character ${jumping ? 'is-jumping' : ''}`} src={partner.image} alt={partner.displayName} />
      {mode === 'room' && running && <span className="rubber-band-launcher" aria-hidden="true">〽</span>}
    </div>

    {mode === 'room' && spirits.map((spirit) => <button key={spirit.id} type="button" className="soot-spirit" style={{ left: `${spirit.x}%`, top: `${spirit.y}%`, width: spirit.size, height: spirit.size } as CSSProperties} onClick={() => shoot(spirit)} aria-label="射擊黑炭精靈"><i /><i /><span>✦</span></button>)}
    {mode === 'room' && shots.map((shot) => <span key={shot.id} className="rubber-band-shot" style={{ '--shot-x': `${shot.x}%`, '--shot-y': `${shot.y}%` } as CSSProperties} aria-hidden="true" />)}
    {mode === 'forest' && trash.map((item) => <span key={item.id} className="forest-trash" style={{ left: `${item.x}%` }} aria-hidden="true">{item.icon}</span>)}

    {!running && <div className="adventure-start-card">
      <span>{mode === 'room' ? '瞄準・點擊' : '空白鍵・跳躍'}</span>
      <h2>{mode === 'room' ? '點擊長出來的黑炭精靈' : '跳過被風吹來的垃圾'}</h2>
      <p>{mode === 'room' ? `和${partner.displayName}一起用橡皮筋守住房間；手機直接點擊也能玩。` : `按空白鍵或下方按鈕跳躍，成功避開就會累積 15 分並保存在本機。`}</p>
      <button type="button" onClick={start}>開始冒險</button>
    </div>}

    {running && <div className="adventure-controls">
      {mode === 'forest' ? <button type="button" onPointerDown={jump}>跳躍</button> : <p>點擊黑炭精靈發射橡皮筋</p>}
      <button type="button" onClick={() => setRunning(false)}>暫停</button>
    </div>}
  </section>;
}
