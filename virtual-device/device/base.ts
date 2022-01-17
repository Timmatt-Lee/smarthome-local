import axios from "axios";
import logger from "../logger";

export enum TYPE {
  WASHER = "WASHER",
  FAN = "FAN",
}

/**
 * Representation of a smart device.
 */
class Base<T = {}> {
  readonly reportStateEndpointUrl: string;

  constructor(
    projectId: string,
    public readonly localId: string,
    protected readonly dbId: string,
    private readonly type: TYPE,
    protected _state: T
  ) {
    this.reportStateEndpointUrl = `https://${projectId}.firebaseapp.com/update-state`;
    this.reportState();
  }

  /**
   * Update device state
   * @param {*} params Updated state attributes
   */
  set state(params: Partial<T>) {
    this._state = Object.assign(this._state, params);
    this.print();
    this.reportState();
  }

  /**
   * Print the current device state
   */
  protected print() {}

  /**
   * Publish the current state to remote endpoint
   */
  protected reportState() {
    axios
      .post(this.reportStateEndpointUrl, {
        userDeviceId: this.dbId,
        type: this.type,
        ...this._state,
      })
      .then((res) => {
        logger.info(`${this.dbId}: Report State successful`);
      })
      .catch((err) => {
        logger.error(`${this.dbId}: Report State error: ${err.message}`);
      });
  }
}

export default Base;
