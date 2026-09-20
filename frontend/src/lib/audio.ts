class SFXEngine {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public playClick() {
    this.init();
    if (!this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime); // High pitched click
    osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.05); // Quick drop
    
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
    
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.05);
  }

  public playChime() {
    this.init();
    if (!this.ctx) return;
    
    const playNote = (freq: number, startTime: number, duration: number) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05); // Attack
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // Decay
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = this.ctx.currentTime;
    // Pleasant completion chord (C Major arpeggio)
    playNote(523.25, now, 1.5);        // C5
    playNote(659.25, now + 0.15, 1.5); // E5
    playNote(783.99, now + 0.3, 2.0);  // G5
    playNote(1046.50, now + 0.45, 2.5); // C6
  }

  public playAlert() {
    this.init();
    if (!this.ctx) return;
    
    // Quick attention-grabbing double beep
    const beep = (startTime: number) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, startTime); // A4
      osc.frequency.exponentialRampToValueAtTime(330, startTime + 0.15); // Drop tone
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
      
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    };

    const now = this.ctx.currentTime;
    beep(now);
    beep(now + 0.3);
  }
}

export const audioEngine = new SFXEngine();
