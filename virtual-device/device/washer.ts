import Base, { TYPE } from "./base";
import logger from "../logger";

class State {
  isOn = false;
  isRunning = false;
  isPaused = false;
  isEco = false;
}

export type UpdateStateParams = Partial<State>;

/**
 * Representation of a smart washer device.
 */
class Washer extends Base<State> {
  constructor(projectId: string, localId: string, dbId: string) {
    super(projectId, localId, dbId, TYPE.WASHER, new State());
    this.state = new State();
    this.reportState();
  }

  /**
   * Update device state
   * @param {*} params Updated state attributes
   */
  override set state(params: Partial<State>) {
    super.state = params;
  }

  /**
   * Print the current device state
   */
   protected print() {
    if (this._state.isOn) {
      const runState = this._state.isPaused
        ? "PAUSED"
        : this._state.isRunning
        ? "RUNNING"
        : "STOPPED";
      logger.info(`***** ${this.dbId} is ${runState} *****`, this._state);
    } else {
      logger.info(`***** ${this.dbId} is OFF *****`);
    }
  }
}

export default Washer;
