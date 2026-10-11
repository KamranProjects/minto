import {
  Check,
  ExternalLink,
  GripVertical,
  Layers,
  Pause,
  Play,
  X,
} from "lucide-react";
import type { DockStyle } from "../shared/model";

interface DockFaceProps {
  layout: DockStyle;
  time: string;
  title: string;
  status: string;
  progress: number;
  running: boolean;
  disabled: boolean;
  hasTask: boolean;
  onToggle: () => void;
  onComplete: () => void;
  onOpen: () => void;
  onClose: () => void;
  onLayout: () => void;
}

export function DockFace(props: DockFaceProps) {
  const { layout, time, title, status, progress, running, disabled } = props;
  return (
    <div className={`designer-dock dock-${layout}`}>
      <header className="designer-tools">
        <GripVertical size={14} aria-label="Drag timer" />
        <span>{status}</span>
        <button
          aria-label="Next dock layout"
          title="Try another layout"
          onClick={props.onLayout}
        >
          <Layers size={13} />
        </button>
        <button aria-label="Show main window" onClick={props.onOpen}>
          <ExternalLink size={13} />
        </button>
        <button aria-label="Close mini timer" onClick={props.onClose}>
          <X size={14} />
        </button>
      </header>
      <div className="designer-readout">
        {layout === "orbit" && (
          <svg className="orbit-track" viewBox="0 0 180 180" aria-hidden="true">
            <circle cx="90" cy="90" r="78" className="orbit-track-base" />
            <circle
              cx="90"
              cy="90"
              r="78"
              className="orbit-track-fill"
              strokeDasharray={`${progress * 490.09} 490.09`}
              transform="rotate(-90 90 90)"
            />
            {Array.from({ length: 12 }, (_, i) => (
              <circle
                key={i}
                cx={90 + 67 * Math.cos((i * Math.PI) / 6)}
                cy={90 + 67 * Math.sin((i * Math.PI) / 6)}
                r="1.4"
                fill="#a3b297"
              />
            ))}
          </svg>
        )}
        {layout === "flip" ? (
          <div className="flip-digits" role="timer" aria-label={time}>
            {time.split(":").map((part, index) => (
              <span
                className="flip-tile"
                key={index}
                style={{ fontSize: part.length > 3 ? "38px" : undefined }}
              >
                {part}
              </span>
            ))}
          </div>
        ) : (
          <span className="designer-time" role="timer">
            {time}
          </span>
        )}
        {layout === "orbit" && (
          <span className="orbit-caption">ONE THING AT A TIME</span>
        )}
      </div>
      <div className="designer-footer">
        <button className="designer-task" onClick={props.onOpen} title={title}>
          {title}
        </button>
        <button
          className="play-button dock-play"
          aria-label={running ? "Pause timer" : "Start timer"}
          disabled={disabled}
          onClick={props.onToggle}
        >
          {running ? (
            <Pause size={15} fill="currentColor" />
          ) : (
            <Play size={15} fill="currentColor" />
          )}
        </button>
        <button
          className="designer-done"
          aria-label="Complete current task"
          onClick={props.onComplete}
          disabled={!props.hasTask}
        >
          <Check size={16} />
        </button>
      </div>
      {layout === "ribbon" && (
        <div className="ribbon-meter" aria-hidden="true">
          <i style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}
