import { useEffect, useRef, useState } from "react";

export function useAudio() {
  const audio = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const [ambient, setAmbient] = useState(false);

  async function prime() {
    audio.current ??= new AudioContext();
    await audio.current.resume();
    return audio.current;
  }

  async function toggleAmbient() {
    if (source.current) {
      source.current.stop();
      source.current.disconnect();
      source.current = null;
      setAmbient(false);
      return;
    }
    const context = await prime();
    const buffer = context.createBuffer(
      1,
      context.sampleRate * 4,
      context.sampleRate,
    );
    const samples = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < samples.length; i++) {
      previous = (previous + Math.random() * 0.04 - 0.02) / 1.02;
      samples[i] = previous * 2;
    }
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    const gain = context.createGain();
    gain.gain.value = 0.16;
    node.connect(gain);
    gain.connect(context.destination);
    node.start();
    source.current = node;
    setAmbient(true);
  }

  function chime() {
    if (!audio.current || audio.current.state !== "running") return;
    const context = audio.current;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.09, context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 1.4);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 1.5);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  useEffect(
    () => () => {
      source.current?.stop();
      void audio.current?.close();
    },
    [],
  );
  return { ambient, toggleAmbient, prime, chime };
}
