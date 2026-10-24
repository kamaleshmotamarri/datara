"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BorderBeam } from "border-beam";
import { Liquid } from "liquid-gooey";
import { ThinkingOrb } from "thinking-orbs";

function useEffects() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReady(!media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return ready;
}

export function MetalButton({
  children,
  onClick,
}: {
  children: string;
  onClick: () => void;
}) {
  return (
    <button className="btn accent" type="button" onClick={onClick}>
      {children}
    </button>
  );
}

export function Beam({
  children,
  active = true,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  const motion = useEffects();
  if (!motion || !active) return children;
  return (
    <BorderBeam
      size="line"
      colorVariant="sunset"
      theme="light"
      strength={0.45}
      staticColors
      borderRadius={0}
    >
      {children}
    </BorderBeam>
  );
}

export function StatusOrb({ label }: { label: string }) {
  const motion = useEffects();
  if (!motion) return null;
  return (
    <ThinkingOrb
      state="working"
      size={20}
      theme="light"
      color="#8a6424"
      aria-label={label}
    />
  );
}

const chips: [string, string][] = [
  ["Table", "The rows, with units"],
  ["Report", "How it was collected"],
  ["Model", "When you ask for one"],
];

function Chip({ title, line }: { title: string; line: string }) {
  return (
    <span className="deliver-chip">
      <strong>{title}</strong>
      <small>{line}</small>
    </span>
  );
}

export function DeliverableSet() {
  const motion = useEffects();
  if (!motion) {
    return (
      <div className="deliver-plain">
        {chips.map(([title, line]) => (
          <Chip key={title} title={title} line={line} />
        ))}
      </div>
    );
  }
  return (
    <Liquid
      className="deliver-liquid"
      blur={14}
      contrast={22}
      fill="#14110e"
      shadow="0 8px 18px rgba(20, 17, 14, 0.12)"
    >
      {chips.map(([title, line]) => (
        <Liquid.Item key={title} className="deliver-item" observe radius={999}>
          <Chip title={title} line={line} />
        </Liquid.Item>
      ))}
    </Liquid>
  );
}
