import { useEffect, useState } from 'react';

interface ScrambleNumberProps {
  value: string;
  duration?: number;
}

export default function ScrambleNumber({ value, duration = 900 }: ScrambleNumberProps) {
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    const chars = '0123456789';
    const target = value;
    const steps = 8;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplay(target);
        clearInterval(interval);
        return;
      }

      const result = target.split('').map((char, i) => {
        if (i < Math.floor((currentStep / steps) * target.length)) {
          return char;
        }
        return chars[Math.floor(Math.random() * chars.length)];
      }).join('');

      setDisplay(result);
    }, duration / steps);

    return () => clearInterval(interval);
  }, [value, duration]);

  return <>{display}</>;
}