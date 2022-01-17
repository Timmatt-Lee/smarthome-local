/**
 * Copyright 2019, Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createSocket } from "dgram";
import express from "express";
import logger from "./logger";

import Washer, {
  UpdateStateParams as WasherUpdateStateParams,
} from "./device/washer";
import Fan, { UpdateStateParams as FanUpdateStateParams } from "./device/fan";
import { exit } from "process";
import Base, { TYPE } from "./device/base";
require("dotenv").config();

interface EnvDevice {
  type: "WASHER" | "FAN";
  localId: string;
  dbId: string;
}

// Create a virtual devices
const envDevices: EnvDevice[] = JSON.parse(process.env.DEVICES);
const virtualDevices: Base[] = envDevices.map((envDevice) => {
  switch (envDevice.type) {
    case "WASHER":
      return new Washer(
        process.env.PROJECT_ID,
        envDevice.localId,
        envDevice.dbId
      );
    case "FAN":
      return new Fan(process.env.PROJECT_ID, envDevice.localId, envDevice.dbId);
    default:
      logger.warn("Unsupported device type in .env");
      exit(1);
  }
});

// Start the UDP server
const udpServer = createSocket("udp4");

udpServer.on("message", (msg, rinfo) => {
  logger.info(`Got [${msg}] from ${rinfo.address}`);

  if (msg.toString() !== process.env.DISCOVERY_PACKET) {
    logger.warn(`The received message is not
      the same as expected magic string [${process.env.DISCOVERY_PACKET}]`);
    return;
  }

  virtualDevices.forEach((device) => {
    // HACK: we need a better way to mock two ip, this is under investigation.
    //        However, you can un-comment following line to create multiple
    //        virtual device connection with Home Hub. It can pass the Test suit
    //        once connection (can be controlled through local fulfillment)
    //        So, do not be frustrated if your Google Assistant ignore your local command
    // if (device.localId === "fan-123") return;

    udpServer.send(device.localId, rinfo.port, rinfo.address, () => {
      logger.info(
        `Done sending [${device.localId}] to ${rinfo.address}:${rinfo.port}`
      );
      logger.info(`Check console logs on your device via chrome://inspect.`);
      logger.info(
        `You should see IDENTIFY intent response with verificationId set to ${device.localId}`
      );
    });
  });
});

udpServer.on("error", (err) => {
  logger.error(`UDP Server error: ${err.message}`);
});

udpServer.on("listening", () => {
  logger.info(`UDP Server listening on ${process.env.DISCOVERY_PORT_OUT}`);
});

// Outbound port for Home device = the port the smart home device should
// listen to
udpServer.bind(process.env.DISCOVERY_PORT_OUT as unknown as number);

interface UpdateStateParams
  extends WasherUpdateStateParams,
    FanUpdateStateParams {
  type?: TYPE;
}

// Start the HTTP server
const server = express();
server.use(express.json());
server.post("/", function (req: { body: UpdateStateParams }, res) {
  logger.info(JSON.stringify(req.body, null, 2));

  const { type } = req.body;
  delete req.body.type;

  switch (type) {
    // TODO: make a map for virtual device with dbId or something else
    case TYPE.WASHER:
      virtualDevices[0].state = req.body;
      break;
    case TYPE.FAN:
      virtualDevices[1].state = req.body;
      break;
    default:
      res.send("UNHANDLED DEVICE TYPE");
      return;
  }
  res.send("OK");
});
server.listen(process.env.SERVER_PORT, () =>
  logger.info(`Device listening on port ${process.env.SERVER_PORT}`)
);
