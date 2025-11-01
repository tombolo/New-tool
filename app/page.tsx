'use client';

import { useEffect, useState, useRef, type ReactNode } from 'react';
import styles from './CopyTradingPage.module.scss';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
} from 'recharts';
import { Moon, Sun, TrendingUp, TrendingDown, Target, Activity } from 'lucide-react';

type SymbolInfo = { symbol: string; display_name: string };

export default function Home() {
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState('R_100');
  const [tick, setTick] = useState<number | null>(null);
  const [overDigit, setOverDigit] = useState<number>(4);
  const [digitCounts, setDigitCounts] = useState<number[]>(Array(10).fill(0));
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const wsRef = useRef<WebSocket | null>(null);
  const pingInterval = useRef<NodeJS.Timeout | null>(null);

  // Load theme from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Initialize WebSocket
  useEffect(() => {
    const ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ active_symbols: 'brief', product_type: 'basic' }));
      pingInterval.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: 1 }));
      }, 30000);
    };

    ws.onmessage = e => {
      const data = JSON.parse(e.data);
      if (data.msg_type === 'active_symbols') {
        const syms = data.active_symbols.map((s: any) => ({
          symbol: s.symbol,
          display_name: s.display_name,
        }));
        setSymbols(syms);
        ws.send(JSON.stringify({ ticks_history: selectedSymbol, count: 1000, end: 'latest', style: 'ticks' }));
        ws.send(JSON.stringify({ ticks: selectedSymbol, subscribe: 1 }));
      } else if (data.msg_type === 'history' && data.history?.prices) {
        const prices = data.history.prices.map((p: string) => parseFloat(p));
        const counts = Array(10).fill(0);
        prices.forEach((price: number) => {
          const lastDigit = Math.floor((price * 10) % 10);
          counts[lastDigit]++;
        });
        setDigitCounts(counts);
      } else if (data.msg_type === 'tick') {
        const price = data.tick.quote;
        setTick(price);
        const lastDigit = Math.floor((price * 10) % 10);
        setDigitCounts(prev => {
          const updated = [...prev];
          updated[lastDigit]++;
          return updated;
        });
      }
    };

    return () => {
      if (pingInterval.current) clearInterval(pingInterval.current);
      ws.close();
    };
  }, []);

  // Symbol change handler
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setDigitCounts(Array(10).fill(0));
    setTick(null);
    ws.send(JSON.stringify({ forget_all: 'ticks' }));
    ws.send(JSON.stringify({ ticks_history: selectedSymbol, count: 1000, end: 'latest', style: 'ticks' }));
    ws.send(JSON.stringify({ ticks: selectedSymbol, subscribe: 1 }));
  }, [selectedSymbol]);

  const totalTicks = digitCounts.reduce((a, b) => a + b, 0) || 1;
  const overPercentage = (digitCounts.filter((_, d) => d > overDigit).reduce((a, b) => a + b, 0) / totalTicks) * 100;
  const underPercentage = (digitCounts.filter((_, d) => d < overDigit).reduce((a, b) => a + b, 0) / totalTicks) * 100;

  const overData = digitCounts
    .map((count, i) => ({
      digit: i,
      percentage: i > overDigit ? (count / totalTicks) * 100 : 0,
    }))
    .filter(d => d.percentage > 0);

  const underData = digitCounts
    .map((count, i) => ({
      digit: i,
      percentage: i < overDigit ? (count / totalTicks) * 100 : 0,
    }))
    .filter(d => d.percentage > 0);

  return (
    <main className={`${styles.container} ${styles[theme]}`}>
      <div className={styles.topBar}>
        <h1>Deriv Analytics</h1>
        <button onClick={toggleTheme} className={styles.themeToggle}>
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>

      <div className={styles.controls}>
        <select value={selectedSymbol} onChange={e => setSelectedSymbol(e.target.value)} className={styles.dropdown}>
          {symbols.map(sym => (
            <option key={sym.symbol} value={sym.symbol}>
              {sym.display_name}
            </option>
          ))}
        </select>

        <div className={styles.overDigitSelector}>
          <Target size={18} />
          <span>Threshold Digit:</span>
          <input
            type="number"
            min="0"
            max="9"
            value={overDigit}
            onChange={e => setOverDigit(Number(e.target.value))}
            className={styles.digitInput}
          />
        </div>
      </div>

      <div className={styles.live}>
        <h2>{selectedSymbol}</h2>
        <p>Current Tick: {tick ? tick.toFixed(5) : 'Loading...'}</p>
      </div>

      {/* Charts */}
      <div className={styles.charts}>
        <div className={styles.chartContainer}>
          <h3>
            <TrendingUp size={18} />
            Over {overDigit}
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={overData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="digit" />
              <YAxis domain={[0, 20]} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
              <Bar dataKey="percentage" fill="#00c851">
                <LabelList 
                  dataKey="percentage" 
                  position="top" 
                  formatter={(value: ReactNode) => {
                    const num = typeof value === 'number' ? value : Number(value);
                    return isNaN(num) ? String(value) : `${num.toFixed(1)}%`;
                  }} 
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartContainer}>
          <h3>
            <TrendingDown size={18} />
            Under {overDigit}
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={underData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="digit" />
              <YAxis domain={[0, 20]} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
              <Bar dataKey="percentage" fill="#ff3366">
                <LabelList 
                  dataKey="percentage" 
                  position="top" 
                  formatter={(value: ReactNode) => {
                    if (typeof value === 'number') {
                      return `${value.toFixed(1)}%`;
                    }
                    return value;
                  }} 
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Digit Frequency Analysis */}
      <div className={styles.analysisSection}>
        {/* Digit Circles */}
        <div className={styles.digitAnalysis}>
          <h3>
            <Activity size={18} />
            Digit Frequency Distribution
          </h3>
          <div className={styles.digitCircles}>
            {digitCounts.map((count, i) => {
              const total = digitCounts.reduce((a, b) => a + b, 0) || 1;
              const percentage = ((count / total) * 100).toFixed(1);
              const isActive = tick ? Math.floor((tick * 10) % 10) === i : false;
              const isOver = i > overDigit;
              const isUnder = i < overDigit;

              const percentageValue = parseFloat(percentage);
              const isEven = i % 2 === 0;
              
              return (
                <div 
                  key={i} 
                  className={`${styles.digitCircle} ${isActive ? styles.activeDigit : ''} ${
                    isOver ? styles.overDigit : isUnder ? styles.underDigit : styles.thresholdDigit
                  }`}
                  data-percentage={percentageValue}
                >
                  <div className={styles.liquidFill} style={{
                    '--fill-percentage': `${percentageValue}%`,
                    '--liquid-color': isOver 
                      ? 'rgba(16, 185, 129, 0.7)' 
                      : isUnder 
                        ? 'rgba(239, 68, 68, 0.7)' 
                        : 'rgba(245, 158, 11, 0.7)'
                  } as React.CSSProperties}>
                    <div className={styles.liquidWave}></div>
                  </div>
                  <div className={styles.digitInner}>
                    <span className={styles.digitNumber}>{i}</span>
                    <span className={styles.digitPercentage}>{percentage}%</span>
                    <span className={styles.digitCount}>({count})</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Over/Under Analysis */}
        <div className={styles.overUnderAnalysis}>
          <h3>Threshold Analysis</h3>
          
          {/* Number Selector */}
          <div className={styles.numberSelector}>
            <span className={styles.selectorLabel}>Select Threshold Digit:</span>
            <div className={styles.numberGrid}>
              {Array.from({ length: 10 }, (_, i) => (
                <button
                  key={i}
                  className={`${styles.numBtn} ${i === overDigit ? styles.selected : ''} ${
                    i > overDigit ? styles.overDigit : i < overDigit ? styles.underDigit : ''
                  }`}
                  onClick={() => setOverDigit(i)}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Progress Bars */}
          <div className={styles.progressAnalysis}>
            <div className={styles.progressCard}>
              <div className={styles.progressHeader}>
                <TrendingUp size={16} />
                <span>Over {overDigit}</span>
                <span className={styles.percentageValue}>{overPercentage.toFixed(1)}%</span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFillOver}
                  style={{ width: `${overPercentage}%` }}
                >
                  <span className={styles.progressText}>{overPercentage.toFixed(1)}%</span>
                </div>
              </div>
              <div className={styles.countInfo}>
                {digitCounts.filter((_, d) => d > overDigit).reduce((a, b) => a + b, 0)} occurrences
              </div>
            </div>

            <div className={styles.progressCard}>
              <div className={styles.progressHeader}>
                <TrendingDown size={16} />
                <span>Under {overDigit}</span>
                <span className={styles.percentageValue}>{underPercentage.toFixed(1)}%</span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFillUnder}
                  style={{ width: `${underPercentage}%` }}
                >
                  <span className={styles.progressText}>{underPercentage.toFixed(1)}%</span>
                </div>
              </div>
              <div className={styles.countInfo}>
                {digitCounts.filter((_, d) => d < overDigit).reduce((a, b) => a + b, 0)} occurrences
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className={styles.summaryStats}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Total Ticks</span>
              <span className={styles.statValue}>{totalTicks}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Current Digit</span>
              <span className={styles.statValue}>
                {tick ? Math.floor((tick * 10) % 10) : '-'}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Threshold</span>
              <span className={styles.statValue}>{overDigit}</span>
            </div>
          </div>
          
          {/* Even/Odd Analysis */}
          <div className={styles.evenOddAnalysis}>
            <h3>Even/Odd Analysis (Last 1000 Ticks)</h3>
            <div className={styles.evenOddContainer}>
              {[0, 1].map(type => {
                const isEven = type === 0;
                const count = digitCounts.filter((_, i) => (i % 2 === 0) === isEven).reduce((a, b) => a + b, 0);
                const percentage = ((count / totalTicks) * 100).toFixed(1);
                const isCurrentEven = tick ? Math.floor((tick * 10) % 10) % 2 === 0 : null;
                
                return (
                  <div 
                    key={type}
                    className={`${styles.evenOddCard} ${isEven ? styles.even : styles.odd} ${
                      isCurrentEven === isEven ? styles.current : ''
                    }`}
                  >
                    <div className={styles.evenOddHeader}>
                      <h4>{isEven ? 'Even' : 'Odd'} Numbers</h4>
                      <div className={styles.evenOddPercentage}>
                        {percentage}% <span>({count})</span>
                      </div>
                    </div>
                    <div className={styles.evenOddBar}>
                      <div 
                        className={`${styles.evenOddFill} ${
                          isEven ? styles.evenFill : styles.oddFill
                        }`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                    <div className={styles.evenOddDigits}>
                      {digitCounts
                        .filter((_, i) => (i % 2 === 0) === isEven)
                        .map((_, idx) => {
                          const digit = isEven ? idx * 2 : idx * 2 + 1;
                          if (digit > 9) return null;
                          return (
                            <span 
                              key={digit}
                              className={`${styles.evenOddDigit} ${
                                tick && Math.floor((tick * 10) % 10) === digit ? styles.activeDigit : ''
                              }`}
                            >
                              {digit}
                            </span>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}