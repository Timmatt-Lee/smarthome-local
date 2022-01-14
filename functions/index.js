/**
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const functions = require('firebase-functions');
const {smarthome} = require('actions-on-google');
const {google} = require('googleapis');
const util = require('util');
const admin = require('firebase-admin');
const {randomUUID} = require('crypto');
const assert = require('assert');
// Initialize Firebase
admin.initializeApp();
const firebaseRef = admin.database().ref('/');
// Initialize Homegraph
const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/homegraph'],
});
const homegraph = google.homegraph({
  version: 'v1',
  auth: auth,
});

exports.login = functions.https.onRequest((request, response) => {
  if (request.method === 'GET') {
    functions.logger.log('Requesting login page');
    response.send(`
    <html>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <body>
        <form action="/login" method="post">
          <input type="hidden"
            name="responseUrl" value="${request.query.responseUrl}" />
          <input type="radio" id="userIdTimmatt" name="userId" 
            value="eca2f3e3" checked>
          <label for="userIdTimmatt">Timmatt</label><br>
          <input type="radio" id="userIdJohn" name="userId" value="7df360a3">
          <label for="userIdJohn">John</label><br>
          <input type="radio" id="userIdMT" name="userId" value="5ac9e5f6">
          <label for="userIdMT">MT</label><br>
          <button type="submit">
            Link this service to Google
          </button>
        </form>
      </body>
    </html>
  `);
  } else if (request.method === 'POST') {
    // Here, you should validate the user account.
    // In this sample, we do not do that.
    // HACK: 我先直接用使用者名稱 base64 傳回去，不過最好應該還是造一個臨時 token 存在 db
    //       然後等下面的 faketoken 一跑進去，驗證這個臨時 token ！這個 token 就直接作廢
    //       而且這個 token 在 db 的時候應該是要指定這個使用者的
    const responseUrl = util.format(
        '%s&code=%s',
        decodeURIComponent(request.body.responseUrl),
        Buffer.from(request.body.userId).toString('base64'),
    );
    functions.logger.log(`Redirect to ${responseUrl}`);
    return response.redirect(responseUrl);
  } else {
    // Unsupported method
    response.send(405, 'Method Not Allowed');
  }
});

exports.auth = functions.https.onRequest((request, response) => {
  const responseUrl = util.format(
      '%s?state=%s',
      decodeURIComponent(request.query.redirect_uri),
      request.query.state,
  );
  functions.logger.log(`Set redirect as ${responseUrl}`);
  return response.redirect(
      `/login?responseUrl=${encodeURIComponent(responseUrl)}`,
  );
});

exports.token = functions.https.onRequest(async (request, response) => {
  const grantType = request.query.grant_type ?
    request.query.grant_type :
    request.body.grant_type;
  const refreshToken = request.query.refresh_token ?
    request.query.refresh_token :
    request.body.refresh_token;

  const secondsInDay = 86400; // 60 * 60 * 24
  const HTTP_STATUS_OK = 200;

  let obj;

  const accessToken = randomUUID();

  if (grantType === 'authorization_code') {
    // HACK: 照理說應該要去 db 拿 這個臨時 token，先去檢驗有沒有是不是有過期，然後再來對照他的使用者是誰，找到這個使用者這樣
    const userId = Buffer.from(request.body.code, 'base64').toString('ascii');
    // TODO: 如果找不到使用者？要處理這個錯誤

    functions.logger.log('Authorization Code', {
      userId,
    });

    await firebaseRef
        .child('tokens')
        .child('access')
        .child(accessToken)
        .set({
          expiredAt: new Date() + secondsInDay,
          userId,
        });

    const refreshToken = randomUUID();

    await firebaseRef
        .child('tokens')
        .child('refresh')
        .child(refreshToken)
        .set({
          expiredAt: new Date() + secondsInDay,
          userId,
        });

    obj = {
      token_type: 'bearer',
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: secondsInDay,
    };
  } else if (grantType === 'refresh_token') {
    const snapshot = await firebaseRef
        .child('tokens')
        .child('refresh')
        .child(refreshToken)
        .once('value');

    functions.logger.log('Refresh Token', {
      refreshToken,
    });

    if (snapshot.val() == null) {
      functions.logger.warn('Cannot find in db', {
        refreshToken,
      });
      response.status(400).json({error: 'invalid_grant'});
      return;
    }

    const {
      isRefreshToken,
      userId,
    } = snapshot.val();
    assert.ok(isRefreshToken === true);

    await firebaseRef
        .child('tokens')
        .child('access')
        .child(accessToken)
        .set({
          expiredAt: new Date() + secondsInDay,
          userId,
        });

    obj = {
      token_type: 'bearer',
      access_token: accessToken,
      expires_in: secondsInDay,
    };
  }
  response.status(HTTP_STATUS_OK).json(obj);
});

const app = smarthome();

app.onSync(async (body, headers) => {
  functions.logger.log('onSync', {body, headers});

  // FIXME: 我應該要有個 middleware 擋在這個 app 前面，然後去做身份驗證，讓這邊都只用 agentId 去做事
  //        不過因為現在先偷懶，所以只有在 onSync 的時候去真的判斷使用者，其他的函式就不判斷了，反正大家都是洗衣機
  const userDoc = await getUserFromHeaders(headers);
  if (userDoc === undefined) {
    functions.logger.warn('Cannot found user in db while onSync.');
    return {};
  }

  const {agentId, devices} = userDoc;

  functions.logger.log('User found on Sync', userDoc);

  const smartHomeDeviceDocs = await getSmartHomeDevicesByUserDeviceIds(devices);

  const res = {
    requestId: body.requestId,
    payload: {
      agentUserId: agentId,
      devices: smartHomeDeviceDocs,
    },
  };

  functions.logger.log('Response on Sync', {res: JSON.stringify(res)});

  return res;
});

const getUserById = async (userId) => {
  const snapshot = await firebaseRef.child('users').child(userId).once('value');
  return snapshot.val();
};

const getUserByToken = async (token) => {
  const snapshot = await firebaseRef
      .child('tokens')
      .child('access')
      .child(token)
      .once('value');

  // TODO: 檢查是否過期

  if (snapshot.val() == null) {
    return undefined;
  }

  const {userId} = snapshot.val();
  return getUserById(userId);
};

const getUserFromHeaders = async (headers) => {
  const bearerToken = headers.authorization.substring(
      7,
      headers.authorization.length,
  );
  return getUserByToken(bearerToken);
};

const getDeviceById = async (deviceId) => {
  const snapshot = await firebaseRef
      .child('devices')
      .child(deviceId)
      .once('value');
  return snapshot.val();
};

const getSmartHomeDevice = async (deviceId) => {
  const result = await getDeviceById(deviceId);
  result.type = `action.devices.types.${result.type}`;
  result.traits = result.traits.map((trait)=>`action.devices.traits.${trait}`);
  return result;
};

const getSmartHomeDevicesByUserDeviceIds = async (userDeviceIds) => {
  return Promise.all(
      userDeviceIds.map(
          async (userDeviceId) =>{
            const {name, deviceId} = await getUserDeviceById(userDeviceId);
            const res = await getSmartHomeDevice(deviceId);
            res.id = userDeviceId;
            res.name.name = name;
            return res;
          },
      ),
  );
};

const getUserDeviceById = async (userDeviceId) => {
  const snapshot = await firebaseRef
      .child('userDevices')
      .child(userDeviceId)
      .once('value');
  return snapshot.val();
};

const getUserSmartHomeDevice = async (userDeviceId) => {
  const userDeviceDoc = await getUserDeviceById(userDeviceId);
  const {type} = await getDeviceById(userDeviceDoc.deviceId);

  switch (type) {
    case 'FAN':
      return {
        on: userDeviceDoc.isOn,
        isRunning: userDeviceDoc.isRunning,
        currentFanSpeedSetting: userDeviceDoc.speedSetting,
        currentFanSpeedPercent: userDeviceDoc.speedPercent,
      };
    case 'WASHER':
      return {
        on: userDeviceDoc.isOn,
        isPaused: userDeviceDoc.isPaused,
        isRunning: userDeviceDoc.isRunning,
        currentRunCycle: [
          {
            currentCycle: 'rinse',
            nextCycle: 'spin',
            lang: 'en',
          },
        ],
        currentTotalRemainingTime: 1212,
        currentCycleRemainingTime: 301,
      };
  }
};

app.onQuery(async (body) => {
  const {requestId} = body;
  const payload = {
    devices: {},
  };
  const queryPromises = [];
  const intent = body.inputs[0];
  for (const device of intent.payload.devices) {
    const userDeviceId = device.id;
    queryPromises.push(
        getUserSmartHomeDevice(userDeviceId).then((data) => {
        // Add response to device payload
          payload.devices[userDeviceId] = data;
        }),
    );
  }
  // Wait for all promises to resolve
  await Promise.all(queryPromises);
  return {
    requestId: requestId,
    payload: payload,
  };
});

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
Number.prototype.clamp = function(min, max) {
  return Math.min(Math.max(this, min), max);
};

const updateDevice = async (execution, userDeviceId) => {
  const {params, command} = execution;
  let state;
  const ref = firebaseRef.child('userDevices').child(userDeviceId);

  const userDeviceDoc = (await ref.once('value')).val();
  const {type} = await getDeviceById(userDeviceDoc.deviceId);

  switch (type) {
    case 'FAN':
      switch (command) {
        case 'action.devices.commands.OnOff':
          state = {isOn: params.on};
          break;
        case 'action.devices.commands.StartStop':
          state = {isRunning: params.start};
          break;
        case 'action.devices.commands.SetFanSpeed':
          if (typeof(params.fanSpeed)=== 'string') {
            state = {speedSetting: params.fanSpeed};
          } else if (typeof(params.fanSpeedPercent)=== 'number') {
            state = {speedPercent: params.fanSpeedPercent};
          } else {
            // TODO: should raise unhandled error
          }
          break;
        case 'action.devices.commands.SetFanSpeedRelative':
          if (typeof(params.fanSpeedRelativeWeight) === 'number') {
            const newSpeed = (userDeviceDoc.speedPercent +
              params.fanSpeedRelativeWeight*10).clamp(0, 100);
            state = {speedPercent: newSpeed};
          } else if (typeof(params.fanSpeedRelativePercent) === 'number') {
            const newSpeed = (userDeviceDoc.speedPercent +
              params.fanSpeedRelativePercent).clamp(0, 100);
            state = {speedPercent: newSpeed};
          }
          break;
        case 'action.devices.commands.Reverse':
          state = {isReverse: !userDeviceDoc.isReverse};
          break;
      }
      break;
    case 'WASHER':
      switch (command) {
        case 'action.devices.commands.OnOff':
          state = {isOn: params.on};
          break;
        case 'action.devices.commands.StartStop':
          state = {isRunning: params.start};
          if (params.start) state.isPaused = false;
          break;
        case 'action.devices.commands.PauseUnpause':
          state = {isPaused: params.pause};
          if (params.pause) state.isRunning = false;
          break;
      }
      break;
  }

  await ref.update(state);

  return state;
};

app.onExecute(async (body) => {
  const {requestId} = body;
  // Execution results are grouped by status
  const result = {
    ids: [],
    status: 'SUCCESS',
    states: {
      online: true,
    },
  };

  const executePromises = [];
  const intent = body.inputs[0];
  for (const command of intent.payload.commands) {
    for (const device of command.devices) {
      for (const execution of command.execution) {
        executePromises.push(
            updateDevice(execution, device.id)
                .then((data) => {
                  result.ids.push(device.id);
                  Object.assign(result.states, data);
                })
                .catch(() => functions.logger.error('EXECUTE', device.id)),
        );
      }
    }
  }

  await Promise.all(executePromises);
  return {
    requestId: requestId,
    payload: {
      commands: [result],
    },
  };
});

app.onDisconnect((body, headers) => {
  functions.logger.log('User account unlinked from Google Assistant');
  // Return empty response
  return {};
});

exports.smarthome = functions.https.onRequest(app);

exports.requestSync = functions.https.onRequest(async (request, response) => {
  response.set('Access-Control-Allow-Origin', '*');
  functions.logger.info(`Request SYNC for user ${request.query.agentUserId}`);
  try {
    const res = await homegraph.devices.requestSync({
      requestBody: {
        agentUserId: request.query.agentUserId,
      },
    });
    functions.logger.info('Request sync response:', res.status, res.data);
    response.json(res.data);
  } catch (err) {
    functions.logger.error(err);
    response.status(500).send(`Error requesting sync: ${err}`);
  }
});

/**
 * Send a REPORT STATE call to the homegraph when data for any device id
 * has been changed.
 */
exports.reportState = functions.database
    .ref('userDevices/{userDeviceId}')
    .onWrite(async (change, context) => {
      functions.logger.info('Firebase write event triggered Report State');
      const snapshot = change.after.val();

      const {agentId: agentUserId} = await getUserById(snapshot.userId);

      let states;

      const {type} = await getDeviceById(snapshot.deviceId);

      switch (type) {
        case 'FAN':
          states= {
            on: snapshot.isOn,
            isRunning: snapshot.isRunning,
            currentFanSpeedSetting: snapshot.speedSetting,
            currentFanSpeedPercent: snapshot.speedPercent,
          };
          break;
        case 'WASHER':
          states= {
            on: snapshot.isOn,
            isPaused: snapshot.isPaused,
            isRunning: snapshot.isRunning,
          };
          break;
      }

      const requestBody = {
        requestId: 'ff36a3cc' /* Any unique ID */,
        agentUserId,
        payload: {
          devices: {
            states: {
            /* Report the current state of our washer */
              [context.params.userDeviceId]: states,
            },
          },
        },
      };

      functions.logger.info('Report state:',
          context.params.userDeviceId, {states, snapshot});

      const res = await homegraph.devices.reportStateAndNotification({
        requestBody,
      });
      functions.logger.info('Report state response:', res.status, res.data);
    });

/**
 * Update the current state of the washer device
 */
exports.updateState = functions.https.onRequest((request, response) => {
  firebaseRef.child('userDevices').child(request.body.userDeviceId).update({
    isOn: request.body.isOn,
    isPaused: request.body.isPaused,
    isRunning: request.body.isRunning,
  });

  return response.status(200).end();
});
