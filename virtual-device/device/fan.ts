import Base, { TYPE } from "./base";
import logger from "../logger";

/**
 * Returns a number whose value is limited to the given range.
 *
 * Example: limit the output of this computation to between 0 and 255
 * (x * 255).clamp(0, 255)
 *
 * @param {Number} min The lower boundary of the output range
 * @param {Number} max The upper boundary of the output range
 * @returns A number in the range [min, max]
 * @type Number
 */
// eslint-disable-next-line no-extend-native
function clamp(this: number, min: number, max: number) {
  return Math.min(Math.max(this, min), max);
}

class State {
  isOn = false;
  isRunning = false;
  speedPercent = 10;
  speedSetting = "slow";
  mode = "crazy";
  isReverse = false;
}

export interface UpdateStateParams extends Partial<State> {
  speedRelativeWeight?: number;
  speedRelativePercent?: number;
}

/**
 * Representation of a smart fan device.
 */
class Fan extends Base<State> {
  constructor(projectId: string, localId: string, dbId: string) {
    super(projectId, localId, dbId, TYPE.FAN, new State());
    this.reportState();
  }

  /**
   * Update device state
   * @param {*} params Updated state attributes
   */
  override set state(params: UpdateStateParams) {
    let newState: Partial<State> = params;
    if (typeof params.speedRelativeWeight === "number") {
      const newSpeed = clamp.bind(
        this._state.speedPercent + params.speedRelativeWeight * 10
      )(0, 100);
      newState = { speedPercent: newSpeed };
    } else if (typeof params.speedRelativePercent === "number") {
      const newSpeed = clamp.bind(
        this._state.speedPercent + params.speedRelativePercent
      )(0, 100);
      newState = { speedPercent: newSpeed };
    } else if (params.isReverse === true) {
      newState = { isReverse: !this._state.isReverse };
    }

    super.state = newState;
  }

  /**
   * Print the current device state
   */
   protected print() {
    if (this._state.isOn) {
      const runState = this._state.isRunning ? "RUNNING" : "STOPPED";
      logger.info(`***** ${this.dbId} is ${runState} *****`, this._state);
    } else {
      logger.info(`***** ${this.dbId} is OFF *****`);
    }
  }
}

export default Fan;
