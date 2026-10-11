import { useState } from "react";
import { Download, Keyboard, Leaf, Trash2 } from "lucide-react";
import { DOCK_LAYOUTS } from "../shared/model";
import { isDesktop, useFocus } from "../state/FocusContext";

export function Settings() {
  const { state, dispatch, exportBackup, resetAll, windowAction } = useFocus();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [resetting, setResetting] = useState(false);
  const settings = state.settings;
  return (
    <section className="settings-page">
      <div className="page-heading">
        <span className="eyebrow">YOUR LITTLE SPACE</span>
        <h1>Make it yours</h1>
        <p>Just enough to feel at home.</p>
      </div>
      <div className="settings-group">
        <h2>Timer</h2>
        <div className="setting-row">
          <span>How time looks</span>
          <div className="timer-style">
            <button
              aria-pressed={settings.timerStyle === "pie"}
              onClick={() =>
                void dispatch({
                  type: "settings.update",
                  settings: { timerStyle: "pie" },
                })
              }
            >
              Pie
            </button>
            <button
              aria-pressed={settings.timerStyle === "digital"}
              onClick={() =>
                void dispatch({
                  type: "settings.update",
                  settings: { timerStyle: "digital" },
                })
              }
            >
              Digital
            </button>
          </div>
        </div>
        <div className="theme-settings">
          <h2>App colors</h2>
          <p className="setting-note">
            Primary colors the controls and menu. Secondary colors the timer and
            highlights. Pick any pair, even the same color.
          </p>
          <div className="theme-colors">
            <label>
              Primary
              <input
                type="color"
                aria-label="Primary app color"
                value={settings.primaryColor}
                onChange={(event) =>
                  void dispatch({
                    type: "settings.update",
                    settings: { primaryColor: event.target.value },
                  })
                }
              />
              <small>{settings.primaryColor}</small>
            </label>
            <label>
              Secondary
              <input
                type="color"
                aria-label="Secondary app color"
                value={settings.accent}
                onChange={(event) =>
                  void dispatch({
                    type: "settings.update",
                    settings: { accent: event.target.value },
                  })
                }
              />
              <small>{settings.accent}</small>
            </label>
          </div>
          <div className="theme-presets" aria-label="Color palettes">
            {[
              { name: "Cozy", primary: "#687e60", secondary: "#db8070" },
              { name: "Forest", primary: "#355f51", secondary: "#b7aa72" },
              { name: "Seaside", primary: "#356b83", secondary: "#d6a681" },
              { name: "Lavender", primary: "#76618c", secondary: "#c49db2" },
            ].map((palette) => (
              <button
                key={palette.name}
                aria-pressed={
                  settings.primaryColor === palette.primary &&
                  settings.accent === palette.secondary
                }
                onClick={() =>
                  void dispatch({
                    type: "settings.update",
                    settings: {
                      primaryColor: palette.primary,
                      accent: palette.secondary,
                    },
                  })
                }
              >
                <i style={{ background: palette.primary }} />
                <i style={{ background: palette.secondary }} />
                {palette.name}
              </button>
            ))}
          </div>
          <button
            className="quiet-button"
            onClick={() =>
              void dispatch({
                type: "settings.update",
                settings: { accent: settings.primaryColor },
              })
            }
          >
            Use primary for both colors
          </button>
        </div>
        <Toggle
          label="Task completed sound"
          description="One brief sound when you mark a task done"
          checked={settings.completionSound}
          onChange={(value) =>
            void dispatch({
              type: "settings.update",
              settings: { completionSound: value },
            })
          }
        />
        <Toggle
          label="A little celebration"
          description="A brief sprinkle when a task is done"
          checked={settings.celebrate}
          onChange={(value) =>
            void dispatch({
              type: "settings.update",
              settings: { celebrate: value },
            })
          }
        />
        <Toggle
          label="Time’s-up chime"
          description="One sound when the countdown pauses at zero"
          checked={settings.sound}
          onChange={(value) =>
            void dispatch({
              type: "settings.update",
              settings: { sound: value },
            })
          }
        />
      </div>
      <div className="settings-group">
        <h2>On your desktop</h2>
        <p className="setting-note">
          Choose a mini timer that fits your workspace. Drag it anywhere; its
          position is remembered.
        </p>
        <div className="dock-gallery" aria-label="Mini timer layouts">
          {DOCK_LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              className="dock-choice"
              aria-pressed={settings.dockStyle === layout.id}
              onClick={() =>
                void dispatch({
                  type: "settings.update",
                  settings: { dockStyle: layout.id },
                })
              }
            >
              <span
                className={`dock-swatch swatch-${layout.id}`}
                aria-hidden="true"
              >
                <i />
                25:00
              </span>
              <strong>{layout.name}</strong>
              <small>{layout.description}</small>
            </button>
          ))}
        </div>
        <button
          className="primary-button preview-dock"
          disabled={!isDesktop}
          onClick={() => void windowAction("showDock")}
        >
          Open selected mini timer
        </button>
        <Toggle
          label="Time’s-up notification"
          description="One desktop notification when the countdown ends"
          checked={settings.notifications}
          disabled={!isDesktop}
          onChange={(value) =>
            void dispatch({
              type: "settings.update",
              settings: { notifications: value },
            })
          }
        />
        <Toggle
          label="Keep main window on top"
          checked={settings.mainOnTop}
          disabled={!isDesktop}
          onChange={(value) =>
            void dispatch({
              type: "settings.update",
              settings: { mainOnTop: value },
            })
          }
        />
        <Toggle
          label="Keep mini timer on top"
          checked={settings.dockOnTop}
          disabled={!isDesktop}
          onChange={(value) =>
            void dispatch({
              type: "settings.update",
              settings: { dockOnTop: value },
            })
          }
        />
        <p className="setting-note">
          Timers pause when your computer sleeps or the app closes. Your
          unfinished tasks stay here.
        </p>
      </div>
      <div className="settings-group">
        <h2>
          <Keyboard size={14} /> A few shortcuts
        </h2>
        <div className="shortcut">
          <span>Start / pause timer</span>
          <kbd>Space</kbd>
        </div>
        <div className="shortcut">
          <span>Add a task</span>
          <kbd>N</kbd>
        </div>
        <div className="shortcut">
          <span>Open mini timer</span>
          <kbd>Ctrl Shift D</kbd>
        </div>
      </div>
      <button className="export-button" onClick={() => void exportBackup()}>
        <Download size={15} />
        <span>Export a backup</span>
      </button>
      <div className="reset-data">
        <h2>Start fresh</h2>
        <p>
          Clear tasks, routines, focus history, and preferences from this
          computer. This cannot be undone. Export a backup first if you want to
          keep a copy.
        </p>
        {!confirmReset ? (
          <button className="reset-open" onClick={() => setConfirmReset(true)}>
            <Trash2 size={14} /> Clear all data…
          </button>
        ) : (
          <div className="reset-confirm">
            <label htmlFor="reset-word">Type RESET to confirm</label>
            <input
              id="reset-word"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
            <div>
              <button
                type="button"
                onClick={() => {
                  setConfirmReset(false);
                  setConfirmation("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmation !== "RESET" || resetting}
                onClick={() => {
                  setResetting(true);
                  void resetAll().then((ok) => {
                    setResetting(false);
                    if (ok) {
                      setConfirmReset(false);
                      setConfirmation("");
                    }
                  });
                }}
              >
                {resetting ? "Clearing…" : "Clear everything"}
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="local-note">
        <Leaf size={13} /> Your tasks live on this computer.
      </p>
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="setting-row">
      <span>
        {label}
        {description && <small>{description}</small>}
      </span>
      <button
        className="toggle"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </div>
  );
}
