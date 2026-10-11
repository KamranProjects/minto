import type { FocusBridge } from "./shared/model";
declare global {
  interface Window {
    cozy?: FocusBridge;
  }
}
